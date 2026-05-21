import { hasTwilioCredentials } from "../config/env.js";
import { runComparator } from "../services/comparator.js";
import { deliverPending } from "../services/notifier.js";
import {
  clearPollProgress,
  POLL_STEPS,
  setPollProgress,
} from "../services/poll-progress.js";
import { failPollRun, finishPollRun, startPollRun } from "../services/poll-run.js";
import { runRateChecker } from "../services/rate-checker.js";
import { logger } from "../lib/logger.js";

export async function pollOrg(orgId: string): Promise<void> {
  logger.info({ orgId }, "poll_org_start");
  const runId = await startPollRun(orgId);
  try {
    setPollProgress(orgId, "Starting rate check…", POLL_STEPS.STARTING);
    await runRateChecker(orgId);
    setPollProgress(orgId, "Comparing rates…", POLL_STEPS.COMPARING);
    await runComparator(orgId);
    if (hasTwilioCredentials()) {
      setPollProgress(orgId, "Processing alerts…", POLL_STEPS.ALERTS);
    }
    await deliverPending(orgId);
    await finishPollRun(runId);
    logger.info({ orgId, runId }, "poll_org_complete");
  } catch (err) {
    await failPollRun(runId, err);
    throw err;
  } finally {
    clearPollProgress(orgId);
  }
}
