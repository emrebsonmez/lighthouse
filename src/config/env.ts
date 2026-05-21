import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Production/live Twilio (used in production, or in dev if test creds unset) */
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  /** Test credentials (Console → test mode). Preferred in local development. */
  TWILIO_TEST_ACCOUNT_SID: z.string().optional(),
  TWILIO_TEST_AUTH_TOKEN: z.string().optional(),
  TWILIO_TEST_PHONE_NUMBER: z.string().optional(),
  TWILIO_TEST_VERIFY_SERVICE_SID: z.string().optional(),
  /** Set to true to use live Twilio credentials while NODE_ENV=development */
  TWILIO_USE_PRODUCTION_CREDENTIALS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  SYSTEM_ADMIN_PHONE: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SEED_ADMIN_PHONE: z.string().optional(),
  SEED_ADMIN_NAME: z.string().default("Emre"),
  SEED_ADMIN_TIMEZONE: z.string().default("America/Los_Angeles"),
});

export const env = envSchema.parse(process.env);

export type TwilioCredentials = {
  accountSid: string;
  phoneNumber: string;
  verifyServiceSid: string | undefined;
  apiKeySid?: string;
  apiKeySecret?: string;
  authToken?: string;
  /** True when using Twilio test Account SID / auth token (dev only) */
  testMode: boolean;
};

/** Use test credentials in development when test SID + token are set (unless overridden). */
export function useTwilioTestCredentials(): boolean {
  if (env.NODE_ENV === "production" || env.NODE_ENV === "test") return false;
  if (env.TWILIO_USE_PRODUCTION_CREDENTIALS) return false;
  return Boolean(env.TWILIO_TEST_ACCOUNT_SID && env.TWILIO_TEST_AUTH_TOKEN);
}

export function requireTwilio(): TwilioCredentials {
  const testMode = useTwilioTestCredentials();

  if (testMode) {
    const accountSid = env.TWILIO_TEST_ACCOUNT_SID!;
    const authToken = env.TWILIO_TEST_AUTH_TOKEN!;
    const phoneNumber =
      env.TWILIO_TEST_PHONE_NUMBER ?? env.TWILIO_PHONE_NUMBER;
    const verifyServiceSid =
      env.TWILIO_TEST_VERIFY_SERVICE_SID ?? env.TWILIO_VERIFY_SERVICE_SID;

    if (!phoneNumber) {
      throw new Error(
        "Test Twilio requires TWILIO_TEST_PHONE_NUMBER or TWILIO_PHONE_NUMBER",
      );
    }

    return {
      accountSid,
      phoneNumber,
      verifyServiceSid,
      authToken,
      testMode: true,
    };
  }

  if (env.NODE_ENV === "development" && env.TWILIO_TEST_ACCOUNT_SID) {
    console.warn(
      "[lighthouse] TWILIO_TEST_ACCOUNT_SID is set but TWILIO_TEST_AUTH_TOKEN is missing; using live credentials.",
    );
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_PHONE_NUMBER) {
    throw new Error(
      "Twilio requires TWILIO_ACCOUNT_SID and TWILIO_PHONE_NUMBER (or test credentials in development)",
    );
  }

  const hasApiKey = Boolean(env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET);
  const hasAuthToken = Boolean(env.TWILIO_AUTH_TOKEN);

  if (!hasApiKey && !hasAuthToken) {
    throw new Error(
      "Twilio auth required: set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (recommended) or TWILIO_AUTH_TOKEN",
    );
  }

  if (hasApiKey && hasAuthToken) {
    throw new Error(
      "Set either API key credentials or TWILIO_AUTH_TOKEN, not both",
    );
  }

  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
    verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID,
    testMode: false,
    ...(hasApiKey
      ? {
          apiKeySid: env.TWILIO_API_KEY_SID!,
          apiKeySecret: env.TWILIO_API_KEY_SECRET!,
        }
      : { authToken: env.TWILIO_AUTH_TOKEN! }),
  };
}
