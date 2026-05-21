import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  alerts,
  compSets,
  organizations,
  rateSnapshots,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { getStayWindowForOrg } from "../lib/dates.js";
import {
  evaluateCompSet,
  priceStr,
  type SnapshotLike,
} from "./evaluate-comp-set.js";

async function latestSnapshot(propertyId: string, stayDate: string) {
  const rows = await db
    .select()
    .from(rateSnapshots)
    .where(
      and(
        eq(rateSnapshots.propertyId, propertyId),
        eq(rateSnapshots.stayDate, stayDate),
      ),
    )
    .orderBy(desc(rateSnapshots.checkedAt))
    .limit(1);
  return rows[0] ?? null;
}

function toSnapshotLike(snap: Awaited<ReturnType<typeof latestSnapshot>>): SnapshotLike | null {
  if (!snap) return null;
  return {
    checkedAt: snap.checkedAt,
    status: snap.status,
    rates: snap.rates as SnapshotLike["rates"],
  };
}

export async function runComparator(orgId: string): Promise<void> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;

  const { stayDate } = getStayWindowForOrg(org);

  const sets = await db
    .select()
    .from(compSets)
    .where(eq(compSets.orgId, orgId));

  for (const compSet of sets) {
    const homeSnap = await latestSnapshot(compSet.homePropertyId, stayDate);
    const compSnap = await latestSnapshot(compSet.competitorPropertyId, stayDate);

    const { outcome, homeMin, compMin } = evaluateCompSet(
      toSnapshotLike(homeSnap),
      toSnapshotLike(compSnap),
      org.maxStalenessSeconds,
    );

    if (outcome === "stale") {
      logger.info({ compSetId: compSet.id, stayDate }, "comparator_skip_stale");
      await clearActiveAlert(compSet, stayDate);
      continue;
    }

    if (outcome === "sold_out" || homeMin === null || compMin === null) {
      logger.info({ compSetId: compSet.id }, "comparator_skip_sold_out");
      await clearActiveAlert(compSet, stayDate);
      continue;
    }

    const undercut = outcome === "undercut";

    const [existing] = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.homePropertyId, compSet.homePropertyId),
          eq(alerts.competitorPropertyId, compSet.competitorPropertyId),
          eq(alerts.stayDate, stayDate),
        ),
      )
      .limit(1);

    if (undercut) {
      if (!existing || !existing.isActive) {
        if (existing) {
          await db
            .update(alerts)
            .set({
              isActive: true,
              activatedAt: new Date(),
              clearedAt: null,
              lastNotifiedAt: null,
              homeCheapest: priceStr(homeMin),
              competitorCheapest: priceStr(compMin),
            })
            .where(eq(alerts.id, existing.id));
        } else {
          await db.insert(alerts).values({
            orgId,
            homePropertyId: compSet.homePropertyId,
            competitorPropertyId: compSet.competitorPropertyId,
            stayDate,
            isActive: true,
            activatedAt: new Date(),
            homeCheapest: priceStr(homeMin),
            competitorCheapest: priceStr(compMin),
            lastNotifiedAt: null,
          });
        }
        logger.info({ compSetId: compSet.id, homeMin, compMin }, "alert_activated");
      } else {
        await db
          .update(alerts)
          .set({
            homeCheapest: priceStr(homeMin),
            competitorCheapest: priceStr(compMin),
          })
          .where(eq(alerts.id, existing.id));
      }
    } else if (existing?.isActive) {
      await db
        .update(alerts)
        .set({ isActive: false, clearedAt: new Date() })
        .where(eq(alerts.id, existing.id));
      logger.info({ compSetId: compSet.id }, "alert_cleared");
    }
  }
}

async function clearActiveAlert(
  compSet: { homePropertyId: string; competitorPropertyId: string },
  stayDate: string,
) {
  await db
    .update(alerts)
    .set({ isActive: false, clearedAt: new Date() })
    .where(
      and(
        eq(alerts.homePropertyId, compSet.homePropertyId),
        eq(alerts.competitorPropertyId, compSet.competitorPropertyId),
        eq(alerts.stayDate, stayDate),
        eq(alerts.isActive, true),
      ),
    );
}
