import { formatInTimeZone } from "date-fns-tz";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  compSets,
  organizations,
  properties,
} from "../db/schema.js";
import { DEBUG_POLL_INTERVALS, getNextPollAt } from "../jobs/boss.js";
import {
  formatCheckedAgo,
  formatStayDateUs,
  getStayWindowForOrg,
  todayInTimezone,
} from "../lib/dates.js";
import {
  outcomeLabel,
  outcomeSubtitle,
} from "./evaluate-comp-set.js";
import {
  buildHeroMessage,
  parseCheapest,
} from "./hero-message.js";
import { getActivePollRun, getPollRunHistory } from "./poll-run.js";
import { getPollProgress } from "./poll-progress.js";

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
  const stayDateMin = todayInTimezone(org.timezone, now);
  const { stayDate } = getStayWindowForOrg(org, now);

  const nextPollAt = await getNextPollAt(org.id);
  const secondsUntilNextPoll = nextPollAt
    ? Math.max(0, Math.floor((nextPollAt.getTime() - now.getTime()) / 1000))
    : null;

  const activeRun = await getActivePollRun(org.id);
  const pollProgress = activeRun ? getPollProgress(org.id) : undefined;
  const historyRows = await getPollRunHistory(org.id, 50);

  const history = historyRows.map((run) => {
    const durationMs =
      run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : null;
    const outcome = run.outcome ?? "error";
    const checkedAt = run.completedAt ?? run.startedAt;
    return {
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      startedAtDate: formatInTimeZone(run.startedAt, org.timezone, "MMM d, yyyy"),
      startedAtTime: formatInTimeZone(run.startedAt, org.timezone, "h:mm:ss a"),
      checkedAgo: formatCheckedAgo(checkedAt, now),
      stayDateDisplay: formatStayDateUs(run.stayDate),
      homeCheapest: run.homeCheapest,
      competitorCheapest: run.competitorCheapest,
      outcome,
      outcomeLabel: outcomeLabel(outcome),
      outcomeSubtitle: outcomeSubtitle(outcome),
      durationMs,
    };
  });

  const latestRun = historyRows[0] ?? null;
  const hero = buildHeroMessage({
    home: homeName,
    competitor: competitorName,
    outcome: latestRun?.outcome ?? null,
    homeMin: parseCheapest(latestRun?.homeCheapest),
    compMin: parseCheapest(latestRun?.competitorCheapest),
    activeRun: !!activeRun,
    progressMessage: pollProgress?.message ?? null,
    stayDate,
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
    stayDateMin,
    canEditStayDate: true,
    nextPollAt: nextPollAt?.toISOString() ?? null,
    secondsUntilNextPoll,
    activeRun: activeRun
      ? {
          id: activeRun.id,
          startedAt: activeRun.startedAt.toISOString(),
          progressMessage: pollProgress?.message ?? "Starting rate check…",
          progressStep: pollProgress?.step ?? null,
        }
      : null,
    hero,
    pollIntervals: [...DEBUG_POLL_INTERVALS],
    history,
  };
}
