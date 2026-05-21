import { describe, expect, it } from "vitest";
import {
  buildHeroMessage,
  formatStayDateShort,
  parseCheapest,
} from "../../src/services/hero-message.js";

const stayDate = "2026-05-21";

const home = "MYC Hotel";
const competitor = "Marram";

describe("buildHeroMessage", () => {
  it("shows prompt when no completed run", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: null,
      homeMin: null,
      compMin: null,
      activeRun: false,
    });
    expect(hero.headline).toBe(
      `Run a check to see how ${home} compares to ${competitor} today.`,
    );
    expect(hero.tone).toBe("neutral");
    expect(hero.priceDelta).toBeNull();
  });

  it("shows checking copy while active", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: "undercut",
      homeMin: 500,
      compMin: 400,
      activeRun: true,
    });
    expect(hero.headline).toBe("Checking rates…");
    expect(hero.outcome).toBeNull();
  });

  it("uses progress message during active run", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: "undercut",
      homeMin: 500,
      compMin: 400,
      activeRun: true,
      progressMessage: "Checking Montauk Yacht Club…",
    });
    expect(hero.headline).toBe("Checking Montauk Yacht Club…");
    expect(hero.tone).toBe("neutral");
    expect(hero.outcome).toBeNull();
  });

  it("undercut headline includes $ delta and stay date", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: "undercut",
      homeMin: 500,
      compMin: 400,
      activeRun: false,
      stayDate,
    });
    expect(hero.headline).toBe(
      `${home} is more expensive on 5/21 than ${competitor} by $100.00.\nConsider a rate adjustment to win the day.`,
    );
    expect(hero.headline).toContain("more expensive");
    expect(hero.headline).toContain("$100.00");
    expect(hero.tone).toBe("bad");
    expect(hero.priceDelta).toBe("100.00");
  });

  it("ahead headline includes $ delta and stay date", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: "ahead",
      homeMin: 300,
      compMin: 450,
      activeRun: false,
      stayDate,
    });
    expect(hero.headline).toContain("LESS expensive on 5/21 than");
    expect(hero.headline).toContain("LESS expensive");
    expect(hero.headline).toContain("$150.00");
    expect(hero.tone).toBe("good");
    expect(hero.priceDelta).toBe("150.00");
  });

  it("tied headline uses shared price and stay date", () => {
    const hero = buildHeroMessage({
      home,
      competitor,
      outcome: "tied",
      homeMin: 425.5,
      compMin: 425.5,
      activeRun: false,
      stayDate,
    });
    expect(hero.headline).toBe(
      `${home} is tied on 5/21 with ${competitor} at $425.50.`,
    );
    expect(hero.tone).toBe("neutral");
  });

  it("stale and error use neutral fallbacks without delta", () => {
    const stale = buildHeroMessage({
      home,
      competitor,
      outcome: "stale",
      homeMin: null,
      compMin: null,
      activeRun: false,
    });
    expect(stale.headline).toContain("too old");
    expect(stale.priceDelta).toBeNull();

    const err = buildHeroMessage({
      home,
      competitor,
      outcome: "error",
      homeMin: null,
      compMin: null,
      activeRun: false,
    });
    expect(err.headline).toContain("failed");
  });
});

describe("formatStayDateShort", () => {
  it("formats yyyy-MM-dd as M/d", () => {
    expect(formatStayDateShort("2026-05-21")).toBe("5/21");
    expect(formatStayDateShort("2026-12-01")).toBe("12/1");
  });
});

describe("parseCheapest", () => {
  it("parses stored price strings", () => {
    expect(parseCheapest("425.50")).toBe(425.5);
    expect(parseCheapest(null)).toBeNull();
    expect(parseCheapest("n/a")).toBeNull();
  });
});
