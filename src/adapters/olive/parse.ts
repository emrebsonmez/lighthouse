import type { NormalizedRate } from "../types.js";

type OliveRate = {
  advanced_pricing?: {
    daily_rate?: number;
    daily_breakdown?: Record<string, { base_rate?: number }>;
  };
};

type OliveRoom = {
  room_type_code: string;
  available_rates?: OliveRate[];
};

export type OliveAvailabilityBody = {
  rooms?: OliveRoom[];
};

export function parseOliveAvailability(
  body: OliveAvailabilityBody,
  stayDate: string,
): NormalizedRate[] {
  const normalized: NormalizedRate[] = [];
  for (const room of body.rooms ?? []) {
    let min: number | null = null;
    for (const rate of room.available_rates ?? []) {
      const ap = rate.advanced_pricing;
      let price: number | null = null;
      if (ap?.daily_rate != null) price = ap.daily_rate;
      else if (ap?.daily_breakdown?.[stayDate]?.base_rate != null) {
        price = ap.daily_breakdown[stayDate].base_rate!;
      }
      if (price == null) continue;
      if (min === null || price < min) min = price;
    }
    if (min !== null) normalized.push({ room_name: room.room_type_code, price: min });
  }
  return normalized;
}
