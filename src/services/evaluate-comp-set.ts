import type { PollOutcome } from "../db/schema.js";

export type SnapshotRates = {
  normalized: { room_name: string; price: number }[];
};

export type SnapshotLike = {
  checkedAt: Date;
  status: "ok" | "sold_out";
  rates: SnapshotRates;
};

function minPrice(normalized: { room_name: string; price: number }[]): number | null {
  if (normalized.length === 0) return null;
  return Math.min(...normalized.map((r) => r.price));
}

export function evaluateCompSet(
  homeSnap: SnapshotLike | null,
  compSnap: SnapshotLike | null,
  maxStalenessSeconds: number,
  now = Date.now(),
): {
  outcome: PollOutcome;
  homeMin: number | null;
  compMin: number | null;
} {
  const maxStaleMs = maxStalenessSeconds * 1000;
  const isStale = (snap: SnapshotLike | null) =>
    !snap || now - snap.checkedAt.getTime() > maxStaleMs;

  if (isStale(homeSnap) || isStale(compSnap)) {
    return { outcome: "stale", homeMin: null, compMin: null };
  }

  if (homeSnap!.status !== "ok" || compSnap!.status !== "ok") {
    return { outcome: "sold_out", homeMin: null, compMin: null };
  }

  const homeMin = minPrice(homeSnap!.rates.normalized);
  const compMin = minPrice(compSnap!.rates.normalized);

  if (homeMin === null || compMin === null) {
    return { outcome: "sold_out", homeMin, compMin };
  }

  if (compMin < homeMin) {
    return { outcome: "undercut", homeMin, compMin };
  }
  if (compMin > homeMin) {
    return { outcome: "ahead", homeMin, compMin };
  }
  return { outcome: "tied", homeMin, compMin };
}

export function outcomeLabel(outcome: PollOutcome): string {
  switch (outcome) {
    case "undercut":
      return "More expensive";
    case "ahead":
      return "Cheaper";
    case "tied":
      return "Tied";
    case "stale":
      return "Stale data";
    case "sold_out":
      return "Sold out";
    case "error":
      return "Error";
    default:
      return outcome;
  }
}

export function outcomeSubtitle(outcome: PollOutcome): string {
  switch (outcome) {
    case "undercut":
      return "Competitor beat our cheapest rate";
    case "ahead":
      return "Our cheapest rate is lower";
    case "tied":
      return "Same cheapest rate";
    case "stale":
      return "Snapshots too old to compare";
    case "sold_out":
      return "One or both properties unavailable";
    case "error":
      return "Poll failed";
    default:
      return "";
  }
}

export function priceStr(n: number): string {
  return n.toFixed(2);
}
