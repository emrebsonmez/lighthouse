import { runComparator } from "../services/comparator.js";
import { deliverPending } from "../services/notifier.js";
import { runRateChecker } from "../services/rate-checker.js";
import { logger } from "../lib/logger.js";

export async function pollOrg(orgId: string): Promise<void> {
  logger.info({ orgId }, "poll_org_start");
  await runRateChecker(orgId);
  await runComparator(orgId);
  await deliverPending(orgId);
  logger.info({ orgId }, "poll_org_complete");
}
