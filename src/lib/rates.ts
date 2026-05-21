import type { NormalizedRate } from "../adapters/types.js";

export function sortRoomsByPriceAsc(rooms: NormalizedRate[]): NormalizedRate[] {
  return [...rooms].sort((a, b) => a.price - b.price);
}
