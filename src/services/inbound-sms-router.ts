import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { feedback, users } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { notifySystemAdmin, sendSms } from "../lib/twilio.js";

const STOP_PATTERN = /^(stop|unsubscribe|cancel|end|quit)$/i;
const HELP_PATTERN = /^help$/i;

export async function handleInboundSms(from: string, body: string): Promise<string> {
  const trimmed = body.trim();
  const normalizedFrom = normalizePhone(from);

  if (STOP_PATTERN.test(trimmed) || /unsubscribe/i.test(trimmed)) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phoneE164, normalizedFrom))
      .limit(1);
    if (user) {
      await db
        .update(users)
        .set({ subscriptionStatus: "unsubscribed" })
        .where(eq(users.id, user.id));
    }
    return "You have been unsubscribed from Lighthouse alerts. Reply START to resubscribe.";
  }

  if (HELP_PATTERN.test(trimmed)) {
    return "Lighthouse: competitive hotel rate alerts. Reply STOP to unsubscribe. https://lighthouse";
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneE164, normalizedFrom))
    .limit(1);

  if (user?.subscriptionStatus === "subscribed") {
    await db.insert(feedback).values({
      userId: user.id,
      phone: normalizedFrom,
      message: trimmed,
    });
    logger.info({ userId: user.id }, "feedback_received");
    return "Thanks — we received your message.";
  }

  const unknownReply =
    "You're not subscribed to Lighthouse yet — we've notified our team and someone should reach out to you shortly.";
  await notifySystemAdmin(`Lighthouse: unknown SMS from ${normalizedFrom}: ${trimmed}`);
  if (user) {
    return unknownReply;
  }
  return unknownReply;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}
