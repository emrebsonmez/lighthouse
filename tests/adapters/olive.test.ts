import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOliveAvailability } from "../../src/adapters/olive/parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "../../fixtures/olive");

describe("parseOliveAvailability", () => {
  it("parses availability with rooms", () => {
    const body = JSON.parse(
      readFileSync(path.join(fixtures, "availability-ok.json"), "utf8"),
    );
    const rates = parseOliveAvailability(body, "2026-06-10");
    expect(rates.length).toBeGreaterThan(0);
    const min = Math.min(...rates.map((r) => r.price));
    expect(min).toBeGreaterThan(0);
    expect(rates.every((r) => r.room_name && typeof r.price === "number")).toBe(true);
  });

  it("returns empty for sold out", () => {
    const body = JSON.parse(
      readFileSync(path.join(fixtures, "availability-sold-out.json"), "utf8"),
    );
    expect(parseOliveAvailability(body, "2026-05-20")).toEqual([]);
  });
});
