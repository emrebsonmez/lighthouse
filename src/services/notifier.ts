import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  alerts,
  notifications,
  organizations,
  properties,
  users,
} from "../db/schema.js";
import { isWithinAlertHours } from "../lib/dates.js";
import { logger } from "../lib/logger.js";
import { sendSms } from "../lib/twilio.js";

const MAX_RETRIES = 3;

async function userNotifiedForActivation(
  alertId: string,
  userId: string,
  activatedAt: Date,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.alertId, alertId),
        eq(notifications.userId, userId),
        eq(notifications.status, "sent"),
        gte(notifications.sentAt, activatedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function recentCooldownHit(
  userId: string,
  homePropertyId: string,
  competitorPropertyId: string,
  cooldownMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(alerts, eq(notifications.alertId, alerts.id))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.status, "sent"),
        gte(notifications.sentAt, since),
        eq(alerts.homePropertyId, homePropertyId),
        eq(alerts.competitorPropertyId, competitorPropertyId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function formatAlertMessage(
  competitorName: string,
  homePrice: string,
  compPrice: string,
  stayDate: string,
  bookingLink: string | undefined,
): string {
  let msg = `Lighthouse: ${competitorName} is cheaper today (${stayDate}). Marram from $${compPrice} vs MYC from $${homePrice}.`;
  if (bookingLink) msg += ` ${bookingLink}`;
  return msg;
}

export async function deliverPending(orgId: string): Promise<void> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;

  const activeAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.orgId, orgId), eq(alerts.isActive, true)));

  const subscribedUsers = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.role, "admin"),
        eq(users.subscriptionStatus, "subscribed"),
      ),
    );

  for (const alert of activeAlerts) {
    if (!alert.activatedAt) continue;

    const [competitor] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, alert.competitorPropertyId))
      .limit(1);

    const compName = competitor?.name ?? "Competitor";
    const bookingLink = competitor?.bookingLinks?.[0];
    const body = formatAlertMessage(
      compName,
      alert.homeCheapest ?? "?",
      alert.competitorCheapest ?? "?",
      alert.stayDate,
      bookingLink,
    );

    for (const user of subscribedUsers) {
      const start = String(user.alertHoursStart).slice(0, 5);
      const end = String(user.alertHoursEnd).slice(0, 5);

      if (!isWithinAlertHours(start, end, user.alertTimezone)) {
        continue;
      }

      if (await userNotifiedForActivation(alert.id, user.id, alert.activatedAt)) {
        continue;
      }

      if (
        await recentCooldownHit(
          user.id,
          alert.homePropertyId,
          alert.competitorPropertyId,
          org.notifyCooldownMinutes,
        )
      ) {
        logger.info({ userId: user.id, alertId: alert.id }, "notifier_skip_cooldown");
        continue;
      }

      let sent = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const [row] = await db
          .insert(notifications)
          .values({
            alertId: alert.id,
            userId: user.id,
            phone: user.phoneE164,
            body,
            status: "pending",
          })
          .returning();

        try {
          const sid = await sendSms(user.phoneE164, body);
          await db
            .update(notifications)
            .set({ status: "sent", twilioSid: sid, sentAt: new Date() })
            .where(eq(notifications.id, row!.id));
          sent = true;
          break;
        } catch (err) {
          await db
            .update(notifications)
            .set({ status: "failed" })
            .where(eq(notifications.id, row!.id));
          logger.error({ err, userId: user.id }, "sms_send_failed");
        }
      }

    }

    if (subscribedUsers.length > 0) {
      const allNotified = await Promise.all(
        subscribedUsers.map((u) =>
          userNotifiedForActivation(alert.id, u.id, alert.activatedAt!),
        ),
      );
      if (allNotified.every(Boolean)) {
        await db
          .update(alerts)
          .set({ lastNotifiedAt: new Date() })
          .where(eq(alerts.id, alert.id));
      }
    }
  }
}
