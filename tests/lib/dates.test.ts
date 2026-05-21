import { describe, expect, it } from "vitest";
import {
  formatCheckedAgo,
  formatStayDateUs,
  isWithinAlertHours,
  parseTimeToMinutes,
  todayInTimezone,
  validateStayDate,
} from "../../src/lib/dates.js";

describe("validateStayDate", () => {
  const tz = "America/New_York";
  const now = new Date("2026-05-20T15:00:00.000Z");

  it("accepts today in org timezone", () => {
    const today = todayInTimezone(tz, now);
    expect(validateStayDate(today, tz, now)).toEqual({ ok: true });
  });

  it("accepts future dates", () => {
    expect(validateStayDate("2026-06-01", tz, now)).toEqual({ ok: true });
  });

  it("rejects past dates", () => {
    expect(validateStayDate("2026-05-19", tz, now)).toEqual({
      ok: false,
      error: "past_date",
    });
  });

  it("rejects invalid format", () => {
    expect(validateStayDate("05/20/2026", tz, now)).toEqual({
      ok: false,
      error: "invalid_format",
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(validateStayDate("2026-02-30", tz, now)).toEqual({
      ok: false,
      error: "invalid_date",
    });
  });
});

describe("todayInTimezone", () => {
  it("returns yyyy-MM-dd in the given timezone", () => {
    const noonUtc = new Date("2026-05-20T16:00:00.000Z");
    expect(todayInTimezone("America/New_York", noonUtc)).toBe("2026-05-20");
  });
});

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

describe("formatStayDateUs", () => {
  it("formats yyyy-MM-dd as MM/DD/YYYY", () => {
    expect(formatStayDateUs("2026-05-21")).toBe("05/21/2026");
    expect(formatStayDateUs("2026-01-05")).toBe("01/05/2026");
  });

  it("returns input when not ISO-shaped", () => {
    expect(formatStayDateUs("invalid")).toBe("invalid");
  });
});

describe("formatCheckedAgo", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it('returns "just now" within one minute', () => {
    const thirtySecAgo = new Date(now.getTime() - 30_000);
    expect(formatCheckedAgo(thirtySecAgo, now)).toBe("just now");
  });

  it("returns distance with suffix for older checks", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    expect(formatCheckedAgo(fiveMinAgo, now)).toBe("5 minutes ago");
  });
});

describe("parseTimeToMinutes", () => {
  it("parses HH:mm", () => {
    expect(parseTimeToMinutes("07:00")).toBe(420);
    expect(parseTimeToMinutes("21:00")).toBe(1260);
  });
});
