import type { Property } from "../../db/schema.js";
import type { AdapterResult } from "../types.js";
import { parseOliveAvailability, type OliveAvailabilityBody } from "./parse.js";

const AVAILABILITY_URL =
  "https://data-api.api.olive.travel/api/v1/booking-engine/availability";

export async function fetchOliveRates(
  property: Property,
  checkIn: string,
  _checkOut: string,
): Promise<AdapterResult> {
  const propertyId = property.identifiers.propertyId;
  if (!propertyId) {
    return {
      status: "failed",
      reason: "missing_property_id",
      rates: { normalized: [], raw: null },
    };
  }

  const url = `${AVAILABILITY_URL}?start_date=${checkIn}&end_date=${_checkOut}&adults=2&children=0`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Property-ID": propertyId,
    },
  });

  if (!res.ok) {
    return {
      status: "failed",
      reason: `availability_http_${res.status}`,
      rates: { normalized: [], raw: null },
    };
  }

  const body = (await res.json()) as OliveAvailabilityBody;
  const rooms = body.rooms ?? [];

  if (rooms.length === 0) {
    return {
      status: "sold_out",
      currency: "USD",
      rates: { normalized: [], raw: body },
    };
  }

  const normalized = parseOliveAvailability(body, checkIn);

  if (normalized.length === 0) {
    return {
      status: "sold_out",
      currency: "USD",
      rates: { normalized: [], raw: body },
    };
  }

  return {
    status: "ok",
    currency: "USD",
    rates: { normalized, raw: body },
  };
}
