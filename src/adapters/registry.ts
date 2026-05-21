import type { Property } from "../db/schema.js";
import type { AdapterResult, RateAdapter } from "./types.js";
import { fetchAzdsRates } from "./azds/index.js";
import { fetchOliveRates } from "./olive/index.js";

const adapters: Record<Property["platform"], RateAdapter> = {
  azds: {
    fetchRates: fetchAzdsRates,
  },
  olive: {
    fetchRates: fetchOliveRates,
  },
};

export function getAdapter(platform: Property["platform"]): RateAdapter | null {
  return adapters[platform] ?? null;
}

export async function runAdapter(
  property: Property,
  checkIn: string,
  checkOut: string,
): Promise<AdapterResult> {
  const adapter = getAdapter(property.platform);
  if (!adapter) {
    return {
      status: "failed",
      reason: `unknown_platform_${property.platform}`,
      rates: { normalized: [], raw: null },
    };
  }
  try {
    return await adapter.fetchRates(property, checkIn, checkOut);
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : "adapter_throw",
      rates: { normalized: [], raw: null },
    };
  }
}
