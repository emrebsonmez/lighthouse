import type { PollOutcome } from "../db/schema.js";
import { priceStr } from "./evaluate-comp-set.js";

export type HeroTone = "bad" | "good" | "neutral";

export type HeroMessage = {
  headline: string;
  tone: HeroTone;
  outcome: PollOutcome | null;
  priceDelta: string | null;
};

export type HeroInput = {
  home: string;
  competitor: string;
  outcome: PollOutcome | null;
  homeMin: number | null;
  compMin: number | null;
  activeRun: boolean;
  progressMessage?: string | null;
  /** yyyy-MM-dd from API */
  stayDate?: string | null;
};

/** US-style short date for headlines (e.g. 2026-05-21 → 5/21). */
export function formatStayDateShort(stayDate: string): string {
  const parts = stayDate.split("-");
  if (parts.length !== 3) return stayDate;
  const month = Number.parseInt(parts[1]!, 10);
  const day = Number.parseInt(parts[2]!, 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return stayDate;
  return `${month}/${day}`;
}

function comparisonWhen(stayDate: string | null | undefined): string {
  return stayDate ? `on ${formatStayDateShort(stayDate)}` : "currently";
}

function priceDelta(homeMin: number, compMin: number): string {
  return priceStr(Math.abs(homeMin - compMin));
}

function tiedPrice(homeMin: number | null, compMin: number | null): string {
  const p = homeMin ?? compMin;
  return p !== null ? priceStr(p) : "—";
}

export function buildHeroMessage(input: HeroInput): HeroMessage {
  const {
    home,
    competitor,
    outcome,
    homeMin,
    compMin,
    activeRun,
    progressMessage,
    stayDate,
  } = input;
  const when = comparisonWhen(stayDate);

  if (activeRun) {
    return {
      headline: progressMessage ?? "Checking rates…",
      tone: "neutral",
      outcome: null,
      priceDelta: null,
    };
  }

  if (!outcome) {
    return {
      headline: `Run a check to see how ${home} compares to ${competitor} today.`,
      tone: "neutral",
      outcome: null,
      priceDelta: null,
    };
  }

  switch (outcome) {
    case "undercut": {
      const delta =
        homeMin !== null && compMin !== null ? priceDelta(homeMin, compMin) : null;
      const deltaText = delta ? `$${delta}` : "";
      const subline = "Consider a rate adjustment to win the day.";
      return {
        headline: delta
          ? `${home} is more expensive ${when} than ${competitor} by ${deltaText}.\n${subline}`
          : `${home} is more expensive ${when} than ${competitor}.\n${subline}`,
        tone: "bad",
        outcome,
        priceDelta: delta,
      };
    }
    case "ahead": {
      const delta =
        homeMin !== null && compMin !== null ? priceDelta(homeMin, compMin) : null;
      const deltaText = delta ? `$${delta}` : "";
      return {
        headline: delta
          ? `${home} is LESS expensive ${when} than ${competitor} by ${deltaText}.`
          : `${home} is less expensive ${when} than ${competitor}.`,
        tone: "good",
        outcome,
        priceDelta: delta,
      };
    }
    case "tied": {
      const at = tiedPrice(homeMin, compMin);
      return {
        headline: `${home} is tied ${when} with ${competitor} at $${at}.`,
        tone: "neutral",
        outcome,
        priceDelta: null,
      };
    }
    case "stale":
      return {
        headline: "Rate data is too old to compare right now.",
        tone: "neutral",
        outcome,
        priceDelta: null,
      };
    case "sold_out":
      return {
        headline: "One or both properties are sold out or unavailable.",
        tone: "neutral",
        outcome,
        priceDelta: null,
      };
    case "error":
      return {
        headline: "The last check failed. Try running a check again.",
        tone: "neutral",
        outcome,
        priceDelta: null,
      };
    default:
      return {
        headline: `Run a check to see how ${home} compares to ${competitor} today.`,
        tone: "neutral",
        outcome: null,
        priceDelta: null,
      };
  }
}

export function parseCheapest(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}
