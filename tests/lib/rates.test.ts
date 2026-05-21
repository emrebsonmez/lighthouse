import { describe, expect, it } from "vitest";
import { sortRoomsByPriceAsc } from "../../src/lib/rates.js";

describe("sortRoomsByPriceAsc", () => {
  it("sorts rooms by price lowest first", () => {
    const rooms = [
      { room_name: "Standard", price: 200 },
      { room_name: "Suite", price: 450 },
      { room_name: "Deluxe", price: 300 },
    ];

    expect(sortRoomsByPriceAsc(rooms)).toEqual([
      { room_name: "Standard", price: 200 },
      { room_name: "Deluxe", price: 300 },
      { room_name: "Suite", price: 450 },
    ]);
  });

  it("does not mutate the input array", () => {
    const rooms = [
      { room_name: "A", price: 100 },
      { room_name: "B", price: 200 },
    ];
    const copy = [...rooms];

    sortRoomsByPriceAsc(rooms);

    expect(rooms).toEqual(copy);
  });
});
