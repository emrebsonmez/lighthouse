export const POLL_STEPS = {
  STARTING: "starting",
  CHECKING_PROPERTY: "checking_property",
  COMPARING: "comparing",
  ALERTS: "alerts",
} as const;

export type PollStep = (typeof POLL_STEPS)[keyof typeof POLL_STEPS];

type PollProgress = {
  message: string;
  step?: PollStep;
  updatedAt: number;
};

const progressByOrg = new Map<string, PollProgress>();

export function setPollProgress(
  orgId: string,
  message: string,
  step?: PollStep,
): void {
  progressByOrg.set(orgId, { message, step, updatedAt: Date.now() });
}

export function getPollProgress(orgId: string): PollProgress | undefined {
  return progressByOrg.get(orgId);
}

export function clearPollProgress(orgId: string): void {
  progressByOrg.delete(orgId);
}
