import type { Property } from "../db/schema.js";

export type NormalizedRate = { room_name: string; price: number };
export type RatesPayload = { normalized: NormalizedRate[]; raw: unknown };

export type AdapterResult =
  | { status: "ok"; currency: string; rates: RatesPayload }
  | { status: "sold_out"; currency: string; rates: { normalized: []; raw: unknown | null } }
  | { status: "failed"; reason: string; rates: { normalized: []; raw: null } };

export interface RateAdapter {
  fetchRates(
    property: Property,
    checkIn: string,
    checkOut: string,
  ): Promise<AdapterResult>;
}
