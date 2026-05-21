import { describe, expect, it } from "vitest";
import { isWithinAlertHours, parseTimeToMinutes } from "../../src/lib/dates.js";

describe("isWithinAlertHours", () => {
  it("returns true inside window", () => {
    const noonSf = new Date("2026-06-10T19:00:00.000Z");
    expect(isWithinAlertHours("07:00", "21:00", "America/Los_Angeles", noonSf)).toBe(true);
  });

  it("returns false outside window", () => {
    const lateSf = new Date("2026-06-11T06:00:00.000Z");
    expect(isWithinAlertHours("07:00", "21:00", "America/Los_Angeles", lateSf)).toBe(false);
  });
});

describe("parseTimeToMinutes", () => {
  it("parses HH:mm", () => {
    expect(parseTimeToMinutes("07:00")).toBe(420);
    expect(parseTimeToMinutes("21:00")).toBe(1260);
  });
});
