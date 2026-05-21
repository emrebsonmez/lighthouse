import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  compSets,
  organizations,
  pollRuns,
  properties,
  rateSnapshots,
} from "../db/schema.js";
import { stayWindowInTimezone } from "../lib/dates.js";
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

export async function startPollRun(orgId: string): Promise<string> {
  const [compSet] = await db
    .select()
    .from(compSets)
    .where(eq(compSets.orgId, orgId))
    .limit(1);

  if (!compSet) {
    throw new Error(`No comp set for org ${orgId}`);
  }

  const [home] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, compSet.homePropertyId))
    .limit(1);

  if (!home) {
    throw new Error(`Home property missing for comp set ${compSet.id}`);
  }

  const { stayDate } = stayWindowInTimezone(home.timezone);

  const [row] = await db
    .insert(pollRuns)
    .values({
      orgId,
      compSetId: compSet.id,
      stayDate,
    })
    .returning({ id: pollRuns.id });

  return row!.id;
}

export async function finishPollRun(runId: string): Promise<void> {
  const [run] = await db
    .select()
    .from(pollRuns)
    .where(eq(pollRuns.id, runId))
    .limit(1);

  if (!run) return;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, run.orgId))
    .limit(1);

  if (!org) return;

  const [compSet] = await db
    .select()
    .from(compSets)
    .where(eq(compSets.id, run.compSetId))
    .limit(1);

  if (!compSet) return;

  const homeSnap = await latestSnapshot(compSet.homePropertyId, run.stayDate);
  const compSnap = await latestSnapshot(compSet.competitorPropertyId, run.stayDate);

  const toSnapshotLike = (snap: typeof homeSnap): SnapshotLike | null => {
    if (!snap) return null;
    return {
      checkedAt: snap.checkedAt,
      status: snap.status,
      rates: snap.rates as SnapshotLike["rates"],
    };
  };

  const { outcome, homeMin, compMin } = evaluateCompSet(
    toSnapshotLike(homeSnap),
    toSnapshotLike(compSnap),
    org.maxStalenessSeconds,
  );

  await db
    .update(pollRuns)
    .set({
      completedAt: new Date(),
      outcome,
      homeCheapest: homeMin !== null ? priceStr(homeMin) : null,
      competitorCheapest: compMin !== null ? priceStr(compMin) : null,
    })
    .where(eq(pollRuns.id, runId));
}

export async function failPollRun(runId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(pollRuns)
    .set({
      completedAt: new Date(),
      outcome: "error",
      detail: { message },
    })
    .where(eq(pollRuns.id, runId));
}

export async function getActivePollRun(orgId: string) {
  const [row] = await db
    .select()
    .from(pollRuns)
    .where(and(eq(pollRuns.orgId, orgId), isNull(pollRuns.completedAt)))
    .orderBy(desc(pollRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getPollRunHistory(orgId: string, limit = 50) {
  return db
    .select()
    .from(pollRuns)
    .where(and(eq(pollRuns.orgId, orgId), isNotNull(pollRuns.completedAt)))
    .orderBy(desc(pollRuns.startedAt))
    .limit(limit);
}
