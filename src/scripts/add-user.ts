import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { organizations, users } from "../db/schema.js";
import { logger } from "../lib/logger.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    phone: get("--phone"),
    name: get("--name") ?? "Admin",
    subscribe: args.includes("--subscribe"),
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
  const { phone, name, subscribe, timezone, hours } = parseArgs();
  if (!phone) throw new Error("Usage: npm run add-user -- --phone +1... [--name Omar] [--subscribe] [--timezone America/New_York] [--hours 7:00-21:00]");

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("No org. Run seed first.");

  let alertHoursStart = "07:00";
  let alertHoursEnd = "21:00";
  if (hours) {
    const [s, e] = hours.split("-");
    if (s && e) {
      alertHoursStart = s.trim();
      alertHoursEnd = e.trim();
    }
  }

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name,
      phoneE164: normalizePhone(phone),
      subscriptionStatus: subscribe ? "subscribed" : "unsubscribed",
      optInAt: subscribe ? new Date() : null,
      alertTimezone: timezone ?? org.timezone,
      alertHoursStart,
      alertHoursEnd,
    })
    .onConflictDoUpdate({
      target: users.phoneE164,
      set: {
        name,
        alertTimezone: timezone ?? org.timezone,
        alertHoursStart,
        alertHoursEnd,
        ...(subscribe
          ? { subscriptionStatus: "subscribed" as const, optInAt: new Date() }
          : {}),
      },
    })
    .returning();

  logger.info({ userId: user!.id }, "user_added");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
