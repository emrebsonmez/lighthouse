import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  time,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const platformEnum = pgEnum("platform", ["azds", "olive"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "subscribed",
  "unsubscribed",
]);
export const userRoleEnum = pgEnum("user_role", ["admin"]);
export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "ok",
  "sold_out",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);
export const pollOutcomeEnum = pgEnum("poll_outcome", [
  "undercut",
  "ahead",
  "tied",
  "stale",
  "sold_out",
  "error",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  pollEveryMinutes: integer("poll_every_minutes").notNull().default(60),
  maxStalenessSeconds: integer("max_staleness_seconds").notNull().default(7200),
  notifyCooldownMinutes: integer("notify_cooldown_minutes").notNull().default(30),
  timezone: text("timezone").notNull().default("America/New_York"),
  stayDateOverride: text("stay_date_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  platform: platformEnum("platform").notNull(),
  bookingLinks: jsonb("booking_links").$type<string[]>().notNull().default([]),
  identifiers: jsonb("identifiers").$type<Record<string, string>>().notNull().default({}),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const compSets = pgTable("comp_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  homePropertyId: uuid("home_property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  competitorPropertyId: uuid("competitor_property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
});

export const rateSnapshots = pgTable("rate_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  stayDate: text("stay_date").notNull(),
  status: snapshotStatusEnum("status").notNull(),
  currency: text("currency").notNull().default("USD"),
  rates: jsonb("rates")
    .$type<{ normalized: { room_name: string; price: number }[]; raw: unknown }>()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull().unique(),
  role: userRoleEnum("role").notNull().default("admin"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .notNull()
    .default("unsubscribed"),
  optInAt: timestamp("opt_in_at", { withTimezone: true }),
  alertHoursStart: time("alert_hours_start").notNull().default("07:00"),
  alertHoursEnd: time("alert_hours_end").notNull().default("21:00"),
  alertTimezone: text("alert_timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    homePropertyId: uuid("home_property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    competitorPropertyId: uuid("competitor_property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    stayDate: text("stay_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    homeCheapest: text("home_cheapest"),
    competitorCheapest: text("competitor_cheapest"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("alerts_active_pair_stay")
      .on(t.homePropertyId, t.competitorPropertyId, t.stayDate)
      .where(sql`${t.isActive} = true`),
  ],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id")
    .notNull()
    .references(() => alerts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  twilioSid: text("twilio_sid"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollRuns = pgTable(
  "poll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    compSetId: uuid("comp_set_id")
      .notNull()
      .references(() => compSets.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    stayDate: text("stay_date").notNull(),
    homeCheapest: text("home_cheapest"),
    competitorCheapest: text("competitor_cheapest"),
    outcome: pollOutcomeEnum("outcome"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("poll_runs_org_started").on(t.orgId, t.startedAt)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  propertyId: uuid("property_id").references(() => properties.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type User = typeof users.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type PollRun = typeof pollRuns.$inferSelect;
export type PollOutcome = (typeof pollOutcomeEnum.enumValues)[number];
