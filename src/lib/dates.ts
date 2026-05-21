import { addDays, format, formatDistance, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInTimezone(timezone: string, now = new Date()): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

export function stayWindowInTimezone(timezone: string, now = new Date()) {
  const checkIn = todayInTimezone(timezone, now);
  const checkOut = formatInTimeZone(addDays(now, 1), timezone, "yyyy-MM-dd");
  return { checkIn, checkOut, stayDate: checkIn };
}

export function stayWindowForDate(stayDate: string) {
  const checkIn = stayDate;
  const checkOut = format(addDays(parseISO(`${stayDate}T12:00:00`), 1), "yyyy-MM-dd");
  return { checkIn, checkOut, stayDate: checkIn };
}

export function getStayWindowForOrg(
  org: { timezone: string; stayDateOverride: string | null },
  now = new Date(),
) {
  if (org.stayDateOverride) {
    return stayWindowForDate(org.stayDateOverride);
  }
  return stayWindowInTimezone(org.timezone, now);
}

export type StayDateValidation =
  | { ok: true }
  | { ok: false; error: "invalid_format" | "invalid_date" | "past_date" };

export function validateStayDate(
  stayDate: string,
  timezone: string,
  now = new Date(),
): StayDateValidation {
  if (!ISO_DATE.test(stayDate)) {
    return { ok: false, error: "invalid_format" };
  }
  const parsed = parseISO(`${stayDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || format(parsed, "yyyy-MM-dd") !== stayDate) {
    return { ok: false, error: "invalid_date" };
  }
  const min = todayInTimezone(timezone, now);
  if (stayDate < min) {
    return { ok: false, error: "past_date" };
  }
  return { ok: true };
}

/** US display for stay dates (yyyy-MM-dd → MM/DD/YYYY). */
export function formatStayDateUs(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
}

const JUST_NOW_MS = 60_000;

/** Relative elapsed time since a poll run completed (or started). */
export function formatCheckedAgo(checkedAt: Date, now: Date): string {
  const ms = now.getTime() - checkedAt.getTime();
  if (ms < JUST_NOW_MS) return "just now";
  return formatDistance(checkedAt, now, { addSuffix: true });
}

/** AZDS expects m/d/Y */
export function toAzdsDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export function isWithinAlertHours(
  alertHoursStart: string,
  alertHoursEnd: string,
  alertTimezone: string,
  now = new Date(),
): boolean {
  const localTime = formatInTimeZone(now, alertTimezone, "HH:mm");
  const minutes = parseTimeToMinutes(localTime);
  const start = parseTimeToMinutes(alertHoursStart.slice(0, 5));
  const end = parseTimeToMinutes(alertHoursEnd.slice(0, 5));
  return minutes >= start && minutes <= end;
}
