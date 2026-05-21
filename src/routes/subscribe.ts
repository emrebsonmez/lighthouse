import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { compSets, properties, users } from "../db/schema.js";
import { getTwilioClient, notifySystemAdmin, sendSms } from "../lib/twilio.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export const subscribeRouter = Router();

/** Twilio A2P: explicit opt-in checkbox required (not pre-checked). */
const consentField = z.literal(true, {
  errorMap: () => ({
    message: "SMS consent is required",
  }),
});

const startVerificationSchema = z.object({
  phone: z.string().min(10),
  consent: consentField,
});

const verifySchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4).max(10),
  consent: consentField,
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

subscribeRouter.post("/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    const err =
      parsed.error.flatten().fieldErrors.consent?.length
        ? "consent_required"
        : "invalid_request";
    res.status(400).json({ error: err });
    return;
  }

  const phoneE164 = normalizePhone(parsed.data.phone);

  if (env.TWILIO_VERIFY_SERVICE_SID) {
    try {
      const twilio = getTwilioClient();
      const check = await twilio.verify.v2
        .services(env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: phoneE164, code: parsed.data.code });
      if (check.status !== "approved") {
        res.status(400).json({ error: "invalid_code" });
        return;
      }
    } catch (err) {
      logger.error({ err }, "verify_check_failed");
      res.status(400).json({ error: "verification_failed" });
      return;
    }
  } else if (env.NODE_ENV === "production") {
    res.status(503).json({ error: "verify_not_configured" });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneE164, phoneE164))
    .limit(1);

  if (!user) {
    const msg =
      "You're not subscribed to Lighthouse yet — we've notified our team and someone should reach out to you shortly.";
    try {
      await sendSms(phoneE164, msg);
    } catch {
      /* best effort */
    }
    await notifySystemAdmin(`Lighthouse: subscribe attempt from unknown ${phoneE164}`);
    res.json({ ok: true, subscribed: false });
    return;
  }

  logger.info({ userId: user.id }, "subscribe_opt_in_confirmed");

  await db
    .update(users)
    .set({ subscriptionStatus: "subscribed", optInAt: new Date() })
    .where(eq(users.id, user.id));

  const [comp] = await db
    .select({ homePropertyId: compSets.homePropertyId })
    .from(compSets)
    .where(eq(compSets.orgId, user.orgId))
    .limit(1);

  let propertyName = "your property";
  if (comp) {
    const [home] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, comp.homePropertyId))
      .limit(1);
    if (home) propertyName = home.name;
  }

  try {
    await sendSms(
      phoneE164,
      `Welcome to Lighthouse. You're now subscribed to competitive intelligence for ${propertyName}.`,
    );
  } catch (err) {
    logger.error({ err }, "welcome_sms_failed");
  }

  res.json({ ok: true, subscribed: true });
});

subscribeRouter.post("/start-verification", async (req, res) => {
  const parsed = startVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "consent_required" });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);
  logger.info({ phone: phone.slice(0, 5) + "…" }, "subscribe_verification_started");

  if (!env.TWILIO_VERIFY_SERVICE_SID) {
    if (env.NODE_ENV !== "production") {
      res.json({ ok: true, dev: true });
      return;
    }
    res.status(503).json({ error: "verify_not_configured" });
    return;
  }
  const twilio = getTwilioClient();
  await twilio.verify.v2
    .services(env.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({ to: phone, channel: "sms" });
  res.json({ ok: true });
});
