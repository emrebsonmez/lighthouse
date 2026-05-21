import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db, pool } from "../db/client.js";
import {
  compSets,
  organizations,
  properties,
  users,
} from "../db/schema.js";
import { rescheduleOrg, stopBoss } from "../jobs/boss.js";
import { logger } from "../lib/logger.js";

const MYC_BOOKING =
  "https://montaukyachtclub.com/rooms/#/booking/step-1";
const MARRAM_BOOKING =
  "https://www.marrammontauk.com/stay#/marram-montauk/";

async function seed() {
  if (!env.SEED_ADMIN_PHONE) {
    throw new Error("SEED_ADMIN_PHONE is required");
  }

  const phone = normalizePhone(env.SEED_ADMIN_PHONE);

  const existing = await db.select().from(organizations).limit(1);
  if (existing.length > 0) {
    logger.info("seed_already_applied");
    const [org] = existing;
    await rescheduleOrg(org!.id, org!.pollEveryMinutes);
    await stopBoss();
    await pool.end();
    return;
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: "Montauk Yacht Club",
      pollEveryMinutes: 60,
      maxStalenessSeconds: 7200,
      notifyCooldownMinutes: 30,
      timezone: "America/New_York",
    })
    .returning();

  const [myc] = await db
    .insert(properties)
    .values({
      orgId: org!.id,
      name: "Montauk Yacht Club",
      platform: "azds",
      bookingLinks: [MYC_BOOKING],
      identifiers: { hotelSlug: "montauk-yacht" },
      timezone: "America/New_York",
    })
    .returning();

  const [marram] = await db
    .insert(properties)
    .values({
      orgId: org!.id,
      name: "Marram Montauk",
      platform: "olive",
      bookingLinks: [MARRAM_BOOKING],
      identifiers: { propertyId: "691711440590999552" },
      timezone: "America/New_York",
    })
    .returning();

  await db.insert(compSets).values({
    orgId: org!.id,
    homePropertyId: myc!.id,
    competitorPropertyId: marram!.id,
  });

  await db.insert(users).values({
    orgId: org!.id,
    name: env.SEED_ADMIN_NAME,
    phoneE164: phone,
    role: "admin",
    subscriptionStatus: "subscribed",
    optInAt: new Date(),
    alertTimezone: env.SEED_ADMIN_TIMEZONE,
    alertHoursStart: "07:00",
    alertHoursEnd: "21:00",
  });

  await rescheduleOrg(org!.id, org!.pollEveryMinutes);
  logger.info({ orgId: org!.id }, "seed_complete");
  await stopBoss();
  await pool.end();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
