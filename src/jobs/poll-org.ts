import { runComparator } from "../services/comparator.js";
import { deliverPending } from "../services/notifier.js";
import { failPollRun, finishPollRun, startPollRun } from "../services/poll-run.js";
import { runRateChecker } from "../services/rate-checker.js";
import { logger } from "../lib/logger.js";

export async function pollOrg(orgId: string): Promise<void> {
  logger.info({ orgId }, "poll_org_start");
  const runId = await startPollRun(orgId);
  try {
    await runRateChecker(orgId);
    await runComparator(orgId);
    await deliverPending(orgId);
    await finishPollRun(runId);
    logger.info({ orgId, runId }, "poll_org_complete");
  } catch (err) {
    await failPollRun(runId, err);
    throw err;
  }
}
