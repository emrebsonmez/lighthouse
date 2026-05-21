CREATE TYPE "poll_outcome" AS ENUM('undercut', 'ahead', 'tied', 'stale', 'sold_out', 'error');

CREATE TABLE "poll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "comp_set_id" uuid NOT NULL REFERENCES "comp_sets"("id") ON DELETE cascade,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "stay_date" text NOT NULL,
  "home_cheapest" text,
  "competitor_cheapest" text,
  "outcome" "poll_outcome",
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX "poll_runs_org_started" ON "poll_runs" ("org_id", "started_at" DESC);
