import { describe, expect, it } from "vitest";
import {
  evaluateCompSet,
  outcomeLabel,
  outcomeSubtitle,
  type SnapshotLike,
} from "../../src/services/evaluate-comp-set.js";

const now = new Date("2026-05-20T20:00:00Z");

function snap(
  price: number,
  status: "ok" | "sold_out" = "ok",
  checkedAt = now,
): SnapshotLike {
  return {
    checkedAt,
    status,
    rates: { normalized: [{ room_name: "Room", price }] },
  };
}

describe("evaluateCompSet", () => {
  it("detects undercut when competitor is cheaper", () => {
    const result = evaluateCompSet(snap(500), snap(400), 7200, now.getTime());
    expect(result.outcome).toBe("undercut");
    expect(result.homeMin).toBe(500);
    expect(result.compMin).toBe(400);
  });

  it("detects ahead when home is cheaper", () => {
    const result = evaluateCompSet(snap(300), snap(450), 7200, now.getTime());
    expect(result.outcome).toBe("ahead");
  });

  it("detects tied prices", () => {
    const result = evaluateCompSet(snap(400), snap(400), 7200, now.getTime());
    expect(result.outcome).toBe("tied");
  });

  it("detects stale snapshots", () => {
    const old = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const result = evaluateCompSet(snap(400, "ok", old), snap(300), 7200, now.getTime());
    expect(result.outcome).toBe("stale");
  });

  it("detects sold out", () => {
    const result = evaluateCompSet(
      snap(400, "sold_out"),
      snap(300),
      7200,
      now.getTime(),
    );
    expect(result.outcome).toBe("sold_out");
  });
});

describe("outcomeLabel", () => {
  it("maps undercut to More expensive", () => {
    expect(outcomeLabel("undercut")).toBe("More expensive");
    expect(outcomeSubtitle("undercut")).toContain("Competitor");
  });

  it("maps ahead to Cheaper", () => {
    expect(outcomeLabel("ahead")).toBe("Cheaper");
  });
});
