import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { users } from "../db/schema.js";
import { logger } from "../lib/logger.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    phone: get("--phone"),
    userId: get("--user-id"),
    timezone: get("--timezone"),
    hours: get("--hours"),
  };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

async function main() {
  const { phone, userId, timezone, hours } = parseArgs();
  if (!timezone) {
    throw new Error(
      "Usage: npm run set-user-timezone -- --timezone America/Los_Angeles (--phone +1... | --user-id uuid) [--hours 7:00-21:00]",
    );
  }
  if (!phone && !userId) throw new Error("Provide --phone or --user-id");

  const updates: Partial<typeof users.$inferInsert> = {
    alertTimezone: timezone,
  };
  if (hours) {
    const [s, e] = hours.split("-");
    if (s && e) {
      updates.alertHoursStart = s.trim();
      updates.alertHoursEnd = e.trim();
    }
  }

  let row;
  if (userId) {
    [row] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
  } else {
    [row] = await db
      .update(users)
      .set(updates)
      .where(eq(users.phoneE164, normalizePhone(phone!)))
      .returning();
  }

  if (!row) throw new Error("User not found");
  logger.info({ userId: row.id, alertTimezone: row.alertTimezone }, "user_updated");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
