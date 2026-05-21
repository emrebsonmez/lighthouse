CREATE TYPE "platform" AS ENUM('azds', 'olive');
CREATE TYPE "subscription_status" AS ENUM('subscribed', 'unsubscribed');
CREATE TYPE "user_role" AS ENUM('admin');
CREATE TYPE "snapshot_status" AS ENUM('ok', 'sold_out');
CREATE TYPE "notification_status" AS ENUM('pending', 'sent', 'failed');

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "poll_every_minutes" integer DEFAULT 60 NOT NULL,
  "max_staleness_seconds" integer DEFAULT 7200 NOT NULL,
  "notify_cooldown_minutes" integer DEFAULT 30 NOT NULL,
  "timezone" text DEFAULT 'America/New_York' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "platform" "platform" NOT NULL,
  "booking_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "timezone" text DEFAULT 'America/New_York' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "comp_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "home_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "competitor_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade
);

CREATE TABLE "rate_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stay_date" text NOT NULL,
  "status" "snapshot_status" NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "rates" jsonb NOT NULL
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "phone_e164" text NOT NULL UNIQUE,
  "role" "user_role" DEFAULT 'admin' NOT NULL,
  "subscription_status" "subscription_status" DEFAULT 'unsubscribed' NOT NULL,
  "opt_in_at" timestamp with time zone,
  "alert_hours_start" time DEFAULT '07:00' NOT NULL,
  "alert_hours_end" time DEFAULT '21:00' NOT NULL,
  "alert_timezone" text DEFAULT 'America/New_York' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "home_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "competitor_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "stay_date" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "home_cheapest" text,
  "competitor_cheapest" text,
  "activated_at" timestamp with time zone,
  "cleared_at" timestamp with time zone,
  "last_notified_at" timestamp with time zone
);

CREATE UNIQUE INDEX "alerts_active_pair_stay" ON "alerts" ("home_property_id", "competitor_property_id", "stay_date") WHERE "is_active" = true;

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "alert_id" uuid NOT NULL REFERENCES "alerts"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "phone" text NOT NULL,
  "body" text NOT NULL,
  "status" "notification_status" DEFAULT 'pending' NOT NULL,
  "twilio_sid" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "phone" text NOT NULL,
  "message" text NOT NULL,
  "property_id" uuid REFERENCES "properties"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "rate_snapshots_property_stay_checked" ON "rate_snapshots" ("property_id", "stay_date", "checked_at" DESC);
