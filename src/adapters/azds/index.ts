import type { Property } from "../../db/schema.js";
import type { AdapterResult, NormalizedRate } from "../types.js";
import { toAzdsDate } from "../../lib/dates.js";

const SESSION_URL = "https://newbooking.azds.com/api/session";
const HOTEL_SLUG = "montauk-yacht";

type AzdsRate = {
  roomCode: string;
  currency: string;
  basePriceBeforeTax: number;
};

type AzdsRoom = { code: string; name: string };

async function getSession(): Promise<string | null> {
  const res = await fetch(SESSION_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as { session?: string };
  return data.session ?? null;
}

export async function fetchAzdsRates(
  property: Property,
  checkIn: string,
  checkOut: string,
): Promise<AdapterResult> {
  const slug = property.identifiers.hotelSlug ?? HOTEL_SLUG;
  const session = await getSession();
  if (!session) {
    return { status: "failed", reason: "session_unavailable", rates: { normalized: [], raw: null } };
  }

  const cookie = `session=${session}`;
  const from = toAzdsDate(checkIn);
  const to = toAzdsDate(checkOut);
  const ratesUrl = `https://newbooking.azds.com/api/hotel/${slug}/rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&adults=2&children=0&language=en`;
  const roomsUrl = `https://newbooking.azds.com/api/hotel/${slug}/rooms`;

  const [ratesRes, roomsRes] = await Promise.all([
    fetch(ratesUrl, { headers: { Accept: "application/json", Cookie: cookie } }),
    fetch(roomsUrl, { headers: { Accept: "application/json", Cookie: cookie } }),
  ]);

  if (!ratesRes.ok) {
    return {
      status: "failed",
      reason: `rates_http_${ratesRes.status}`,
      rates: { normalized: [], raw: null },
    };
  }

  const ratesBody = (await ratesRes.json()) as { rates?: AzdsRate[]; errors?: unknown[] };
  if (ratesBody.errors?.length) {
    return {
      status: "failed",
      reason: "rates_api_error",
      rates: { normalized: [], raw: null },
    };
  }

  const rateList = ratesBody.rates ?? [];
  if (rateList.length === 0) {
    return {
      status: "sold_out",
      currency: "USD",
      rates: { normalized: [], raw: ratesBody },
    };
  }

  const roomNames = new Map<string, string>();
  if (roomsRes.ok) {
    const roomsBody = (await roomsRes.json()) as { rooms?: AzdsRoom[] };
    for (const room of roomsBody.rooms ?? []) {
      roomNames.set(room.code, room.name);
    }
  }

  const byRoom = new Map<string, number>();
  for (const rate of rateList) {
    const price = rate.basePriceBeforeTax;
    if (typeof price !== "number") continue;
    const prev = byRoom.get(rate.roomCode);
    if (prev === undefined || price < prev) {
      byRoom.set(rate.roomCode, price);
    }
  }

  const normalized: NormalizedRate[] = [...byRoom.entries()].map(([code, price]) => ({
    room_name: roomNames.get(code) ?? code,
    price,
  }));

  const currency = rateList[0]?.currency ?? "USD";

  return {
    status: "ok",
    currency,
    rates: { normalized, raw: ratesBody },
  };
}
