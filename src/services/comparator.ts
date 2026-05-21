import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  alerts,
  compSets,
  organizations,
  properties,
  rateSnapshots,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { stayWindowInTimezone } from "../lib/dates.js";

type SnapshotRates = {
  normalized: { room_name: string; price: number }[];
};

function minPrice(normalized: { room_name: string; price: number }[]): number | null {
  if (normalized.length === 0) return null;
  return Math.min(...normalized.map((r) => r.price));
}

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

export async function runComparator(orgId: string): Promise<void> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;

  const sets = await db
    .select()
    .from(compSets)
    .where(eq(compSets.orgId, orgId));

  for (const compSet of sets) {
    const [home] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, compSet.homePropertyId))
      .limit(1);
    if (!home) continue;

    const { stayDate } = stayWindowInTimezone(home.timezone);
    const homeSnap = await latestSnapshot(compSet.homePropertyId, stayDate);
    const compSnap = await latestSnapshot(compSet.competitorPropertyId, stayDate);

    const now = Date.now();
    const maxStaleMs = org.maxStalenessSeconds * 1000;

    const isStale = (snap: typeof homeSnap) =>
      !snap || now - snap.checkedAt.getTime() > maxStaleMs;

    if (isStale(homeSnap) || isStale(compSnap)) {
      logger.info({ compSetId: compSet.id, stayDate }, "comparator_skip_stale");
      await clearActiveAlert(compSet, stayDate);
      continue;
    }

    if (homeSnap!.status !== "ok" || compSnap!.status !== "ok") {
      logger.info({ compSetId: compSet.id }, "comparator_skip_sold_out");
      await clearActiveAlert(compSet, stayDate);
      continue;
    }

    const homeRates = homeSnap!.rates as SnapshotRates;
    const compRates = compSnap!.rates as SnapshotRates;
    const homeMin = minPrice(homeRates.normalized);
    const compMin = minPrice(compRates.normalized);

    if (homeMin === null || compMin === null) {
      await clearActiveAlert(compSet, stayDate);
      continue;
    }

    const undercut = compMin < homeMin;

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
      const priceStr = (n: number) => n.toFixed(2);
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
