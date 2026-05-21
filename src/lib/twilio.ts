import Twilio from "twilio";
import { env, requireTwilio, useTwilioTestCredentials } from "../config/env.js";
import { logger } from "./logger.js";

let client: Twilio.Twilio | null = null;
let clientTestMode: boolean | null = null;
let modeLogged = false;

export function getTwilioClient(): Twilio.Twilio {
  const creds = requireTwilio();
  if (!modeLogged) {
    modeLogged = true;
    logger.info(
      {
        twilioMode: creds.testMode ? "test" : "live",
        nodeEnv: env.NODE_ENV,
      },
      creds.testMode ? "twilio_using_test_credentials" : "twilio_using_live_credentials",
    );
  }
  if (client && clientTestMode === creds.testMode) {
    return client;
  }

  if (creds.apiKeySid && creds.apiKeySecret) {
    client = Twilio(creds.apiKeySid, creds.apiKeySecret, {
      accountSid: creds.accountSid,
    });
  } else {
    client = Twilio(creds.accountSid, creds.authToken!);
  }
  clientTestMode = creds.testMode;
  return client;
}

export function isTwilioTestMode(): boolean {
  return useTwilioTestCredentials();
}

export async function sendSms(to: string, body: string): Promise<string | null> {
  const creds = requireTwilio();
  const twilio = getTwilioClient();
  const msg = await twilio.messages.create({
    to,
    from: creds.phoneNumber,
    body,
  });
  return msg.sid;
}

export async function notifySystemAdmin(body: string): Promise<void> {
  if (!env.SYSTEM_ADMIN_PHONE) return;
  try {
    await sendSms(env.SYSTEM_ADMIN_PHONE, body);
  } catch {
    // logged by caller
  }
}
