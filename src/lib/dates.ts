import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";

export function stayWindowInTimezone(timezone: string, now = new Date()) {
  const checkIn = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const checkOut = formatInTimeZone(addDays(now, 1), timezone, "yyyy-MM-dd");
  return { checkIn, checkOut, stayDate: checkIn };
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
