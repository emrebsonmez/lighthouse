import { Router } from "express";
import { buildDebugStatus } from "../services/debug-status.js";
import { pollOrg } from "../jobs/poll-org.js";
import { db } from "../db/client.js";
import { organizations } from "../db/schema.js";
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
