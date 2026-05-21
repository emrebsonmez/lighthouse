import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  compSets,
  organizations,
  pollRuns,
  properties,
  rateSnapshots,
} from "../db/schema.js";
import { getStayWindowForOrg } from "../lib/dates.js";
import { sortRoomsByPriceAsc } from "../lib/rates.js";
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

export type RunSnapshotDetail = {
  propertyId: string;
  propertyName: string;
  platform: string;
  status: string;
  currency: string;
  checkedAt: string;
  rates: { normalized: { room_name: string; price: number }[]; raw: unknown };
};

function withSortedRates(snapshot: RunSnapshotDetail): RunSnapshotDetail {
  return {
    ...snapshot,
    rates: {
      ...snapshot.rates,
      normalized: sortRoomsByPriceAsc(snapshot.rates.normalized),
    },
  };
}

async function snapshotsForRun(
  run: { startedAt: Date; stayDate: string },
  props: { id: string; name: string; platform: string }[],
): Promise<RunSnapshotDetail[]> {
  const snapshots: RunSnapshotDetail[] = [];
  for (const prop of props) {
    const [snap] = await db
      .select()
      .from(rateSnapshots)
      .where(
        and(
          eq(rateSnapshots.propertyId, prop.id),
          eq(rateSnapshots.stayDate, run.stayDate),
          gte(rateSnapshots.checkedAt, run.startedAt),
        ),
      )
      .orderBy(desc(rateSnapshots.checkedAt))
      .limit(1);
    if (snap) {
      snapshots.push(
        withSortedRates({
          propertyId: prop.id,
          propertyName: prop.name,
          platform: prop.platform,
          status: snap.status,
          currency: snap.currency,
          checkedAt: snap.checkedAt.toISOString(),
          rates: snap.rates as RunSnapshotDetail["rates"],
        }),
      );
    }
  }
  return snapshots;
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

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error(`Org ${orgId} not found`);
  }

  const { stayDate } = getStayWindowForOrg(org);

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

  const [homeProp] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, compSet.homePropertyId))
    .limit(1);
  const [compProp] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, compSet.competitorPropertyId))
    .limit(1);

  const runProps = [];
  if (homeProp) {
    runProps.push({
      id: homeProp.id,
      name: homeProp.name,
      platform: homeProp.platform,
    });
  }
  if (compProp) {
    runProps.push({
      id: compProp.id,
      name: compProp.name,
      platform: compProp.platform,
    });
  }

  const snapshots = await snapshotsForRun(run, runProps);

  await db
    .update(pollRuns)
    .set({
      completedAt: new Date(),
      outcome,
      homeCheapest: homeMin !== null ? priceStr(homeMin) : null,
      competitorCheapest: compMin !== null ? priceStr(compMin) : null,
      detail: { snapshots },
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

function detailSnapshots(detail: Record<string, unknown>): RunSnapshotDetail[] | null {
  const raw = detail.snapshots;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as RunSnapshotDetail[];
}

export async function getPollRunDetail(runId: string) {
  const [run] = await db
    .select()
    .from(pollRuns)
    .where(eq(pollRuns.id, runId))
    .limit(1);

  if (!run) return null;

  const stored = detailSnapshots(run.detail);
  if (stored) {
    return { run, snapshots: stored.map(withSortedRates) };
  }

  const [compSet] = await db
    .select()
    .from(compSets)
    .where(eq(compSets.id, run.compSetId))
    .limit(1);

  if (!compSet) {
    return { run, snapshots: [] as RunSnapshotDetail[] };
  }

  const [homeProp] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, compSet.homePropertyId))
    .limit(1);
  const [compProp] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, compSet.competitorPropertyId))
    .limit(1);

  const runProps = [];
  if (homeProp) {
    runProps.push({
      id: homeProp.id,
      name: homeProp.name,
      platform: homeProp.platform,
    });
  }
  if (compProp) {
    runProps.push({
      id: compProp.id,
      name: compProp.name,
      platform: compProp.platform,
    });
  }

  const snapshots = await snapshotsForRun(run, runProps);
  return { run, snapshots };
}
