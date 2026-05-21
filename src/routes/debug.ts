import { Router } from "express";
import { z } from "zod";
import { buildDebugStatus } from "../services/debug-status.js";
import { pollOrg } from "../jobs/poll-org.js";
import {
  DEBUG_POLL_INTERVALS,
  getNextPollAt,
  rescheduleOrg,
} from "../jobs/boss.js";
import { getPollRunDetail } from "../services/poll-run.js";
import { db } from "../db/client.js";
import { organizations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { validateStayDate } from "../lib/dates.js";
import { logger } from "../lib/logger.js";

export const debugRouter = Router();

debugRouter.get("/status", async (_req, res) => {
  try {
    const status = await buildDebugStatus();
    if ("error" in status) {
      res.status(404).json(status);
      return;
    }
    res.json(status);
  } catch (err) {
    logger.error(err, "debug_status_failed");
    res.status(500).json({ error: "internal_error" });
  }
});

const pollInFlight = new Set<string>();

const pollIntervalSchema = z.object({
  pollEveryMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(30),
    z.literal(60),
  ]),
});

const stayDateSchema = z.object({
  stayDate: z.string(),
});

debugRouter.patch("/poll-interval", async (req, res) => {
  try {
    const parsed = pollIntervalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", allowed: DEBUG_POLL_INTERVALS });
      return;
    }

    const [org] = await db.select().from(organizations).limit(1);
    if (!org) {
      res.status(404).json({ error: "no_org" });
      return;
    }

    await db
      .update(organizations)
      .set({ pollEveryMinutes: parsed.data.pollEveryMinutes })
      .where(eq(organizations.id, org.id));

    await rescheduleOrg(org.id, parsed.data.pollEveryMinutes);
    const nextPollAt = await getNextPollAt(org.id);

    res.json({
      pollEveryMinutes: parsed.data.pollEveryMinutes,
      nextPollAt: nextPollAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error(err, "debug_poll_interval_failed");
    res.status(500).json({ error: "internal_error" });
  }
});

debugRouter.patch("/stay-date", async (req, res) => {
  try {
    const parsed = stayDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    const [org] = await db.select().from(organizations).limit(1);
    if (!org) {
      res.status(404).json({ error: "no_org" });
      return;
    }

    const validation = validateStayDate(parsed.data.stayDate, org.timezone);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    await db
      .update(organizations)
      .set({ stayDateOverride: parsed.data.stayDate })
      .where(eq(organizations.id, org.id));

    res.json({ stayDate: parsed.data.stayDate });
  } catch (err) {
    logger.error(err, "debug_stay_date_failed");
    res.status(500).json({ error: "internal_error" });
  }
});

debugRouter.get("/runs/:runId", async (req, res) => {
  try {
    const detail = await getPollRunDetail(req.params.runId);
    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { run, snapshots } = detail;
    res.json({
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      stayDate: run.stayDate,
      outcome: run.outcome,
      homeCheapest: run.homeCheapest,
      competitorCheapest: run.competitorCheapest,
      snapshots,
    });
  } catch (err) {
    logger.error(err, "debug_run_detail_failed");
    res.status(500).json({ error: "internal_error" });
  }
});

debugRouter.post("/poll-now", async (_req, res) => {
  try {
    const [org] = await db.select().from(organizations).limit(1);
    if (!org) {
      res.status(404).json({ error: "no_org" });
      return;
    }

    if (pollInFlight.has(org.id)) {
      res.json({ started: false, message: "poll_already_running" });
      return;
    }

    pollInFlight.add(org.id);
    res.json({ started: true });

    pollOrg(org.id)
      .catch((err) => logger.error({ orgId: org.id, err }, "debug_poll_now_failed"))
      .finally(() => pollInFlight.delete(org.id));
  } catch (err) {
    logger.error(err, "debug_poll_now_failed");
    res.status(500).json({ error: "internal_error" });
  }
});
