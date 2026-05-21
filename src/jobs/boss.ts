import PgBoss from "pg-boss";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { organizations } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { pollOrg } from "./poll-org.js";

const JOB_NAME = "poll-org";

let boss: PgBoss | null = null;
const registeredWorkers = new Set<string>();

function cronForMinutes(minutes: number): string {
  const allowed = [5, 10, 15, 30, 60];
  if (!allowed.includes(minutes)) {
    throw new Error(`poll_every_minutes must be one of ${allowed.join(", ")}`);
  }
  return `*/${minutes} * * * *`;
}

function queueNameForOrg(orgId: string): string {
  return `${JOB_NAME}-${orgId}`;
}

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: env.DATABASE_URL });
    await boss.start();
  }
  return boss;
}

/** pg-boss requires a queue row before schedule(); each org gets its own queue + worker. */
async function ensureOrgQueue(orgId: string): Promise<string> {
  const b = await getBoss();
  const queueName = queueNameForOrg(orgId);

  try {
    await b.createQueue(queueName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("already") && !msg.includes("duplicate")) {
      const existing = await b.getQueue(queueName).catch(() => null);
      if (!existing) throw err;
    }
  }

  if (!registeredWorkers.has(queueName)) {
    await b.work(queueName, async (jobs) => {
      for (const job of jobs) {
        const { organizationId } = job.data as { organizationId: string };
        await pollOrg(organizationId);
      }
    });
    registeredWorkers.add(queueName);
  }

  return queueName;
}

export async function rescheduleOrg(orgId: string, pollEveryMinutes: number): Promise<void> {
  const b = await getBoss();
  const queueName = await ensureOrgQueue(orgId);

  try {
    await b.unschedule(queueName);
  } catch {
    // schedule may not exist yet
  }

  await b.schedule(
    queueName,
    cronForMinutes(pollEveryMinutes),
    { organizationId: orgId },
    { tz: "UTC" },
  );
  logger.info({ orgId, pollEveryMinutes, queueName }, "org_scheduled");
}

export async function rescheduleAllOrgs(): Promise<void> {
  const orgs = await db.select().from(organizations);
  for (const org of orgs) {
    await rescheduleOrg(org.id, org.pollEveryMinutes);
  }
}

export async function startBoss(): Promise<PgBoss> {
  const b = await getBoss();
  await rescheduleAllOrgs();
  return b;
}

/** Release connections so one-off scripts (seed, CLI) can exit. */
export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 5000 });
    boss = null;
    registeredWorkers.clear();
  }
}
