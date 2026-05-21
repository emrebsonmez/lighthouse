import { eq, inArray } from "drizzle-orm";
import { runAdapter } from "../adapters/registry.js";
import { db } from "../db/client.js";
import {
  compSets,
  properties,
  rateSnapshots,
  type Property,
} from "../db/schema.js";
import { stayWindowInTimezone } from "../lib/dates.js";
import { logger } from "../lib/logger.js";
import * as Sentry from "@sentry/node";

export async function getPropertiesForOrg(orgId: string): Promise<Property[]> {
  const sets = await db
    .select()
    .from(compSets)
    .where(eq(compSets.orgId, orgId));

  const ids = new Set<string>();
  for (const s of sets) {
    ids.add(s.homePropertyId);
    ids.add(s.competitorPropertyId);
  }
  if (ids.size === 0) return [];

  return db
    .select()
    .from(properties)
    .where(inArray(properties.id, [...ids]));
}

export async function runRateChecker(orgId: string): Promise<void> {
  const props = await getPropertiesForOrg(orgId);

  for (const property of props) {
    const { checkIn, checkOut, stayDate } = stayWindowInTimezone(property.timezone);
    const result = await runAdapter(property, checkIn, checkOut);

    if (result.status === "failed") {
      logger.error(
        {
          propertyId: property.id,
          propertyName: property.name,
          platform: property.platform,
          reason: result.reason,
        },
        "adapter_failed",
      );
      Sentry.captureMessage(`Adapter failed: ${property.name} — ${result.reason}`, "warning");
      continue;
    }

    const ratesPayload =
      result.status === "ok"
        ? result.rates
        : { normalized: [] as { room_name: string; price: number }[], raw: result.rates.raw };

    await db.insert(rateSnapshots).values({
      propertyId: property.id,
      stayDate,
      status: result.status,
      currency: result.currency,
      rates: ratesPayload,
    });

    logger.info(
      {
        propertyId: property.id,
        status: result.status,
        roomCount: ratesPayload.normalized.length,
      },
      "snapshot_written",
    );
  }
}
