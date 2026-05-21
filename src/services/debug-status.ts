import { formatInTimeZone } from "date-fns-tz";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  compSets,
  organizations,
  properties,
} from "../db/schema.js";
import { getNextPollAt } from "../jobs/boss.js";
import { stayWindowInTimezone } from "../lib/dates.js";
import {
  outcomeLabel,
  outcomeSubtitle,
} from "./evaluate-comp-set.js";
import { getActivePollRun, getPollRunHistory } from "./poll-run.js";

export async function buildDebugStatus() {
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    return { error: "no_org", message: "No organization found. Run npm run seed." };
  }

  const [compSet] = await db
    .select()
    .from(compSets)
    .where(eq(compSets.orgId, org.id))
    .limit(1);

  let homeName = "Home";
  let competitorName = "Competitor";
  if (compSet) {
    const [home] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, compSet.homePropertyId))
      .limit(1);
    const [comp] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, compSet.competitorPropertyId))
      .limit(1);
    if (home) homeName = home.name;
    if (comp) competitorName = comp.name;
  }

  const now = new Date();
  const nowLocal = formatInTimeZone(now, org.timezone, "h:mm a");
  let stayDate = formatInTimeZone(now, org.timezone, "yyyy-MM-dd");
  if (compSet) {
    const [home] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, compSet.homePropertyId))
      .limit(1);
    if (home) {
      stayDate = stayWindowInTimezone(home.timezone).stayDate;
    }
  }

  const nextPollAt = await getNextPollAt(org.id);
  const secondsUntilNextPoll = nextPollAt
    ? Math.max(0, Math.floor((nextPollAt.getTime() - now.getTime()) / 1000))
    : null;

  const activeRun = await getActivePollRun(org.id);
  const historyRows = await getPollRunHistory(org.id, 50);

  const history = historyRows.map((run) => {
    const durationMs =
      run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : null;
    const outcome = run.outcome ?? "error";
    return {
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      startedAtLocal: formatInTimeZone(run.startedAt, org.timezone, "h:mm:ss a"),
      homeCheapest: run.homeCheapest,
      competitorCheapest: run.competitorCheapest,
      outcome,
      outcomeLabel: outcomeLabel(outcome),
      outcomeSubtitle: outcomeSubtitle(outcome),
      durationMs,
    };
  });

  return {
    serverTime: now.toISOString(),
    org: {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      pollEveryMinutes: org.pollEveryMinutes,
    },
    properties: { home: homeName, competitor: competitorName },
    nowLocal,
    stayDate,
    nextPollAt: nextPollAt?.toISOString() ?? null,
    secondsUntilNextPoll,
    activeRun: activeRun
      ? { id: activeRun.id, startedAt: activeRun.startedAt.toISOString() }
      : null,
    history,
  };
}
