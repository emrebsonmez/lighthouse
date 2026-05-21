import { describe, expect, it } from "vitest";

function isUndercut(homeMin: number | null, compMin: number | null): boolean {
  if (homeMin === null || compMin === null) return false;
  return compMin < homeMin;
}

describe("undercut rule", () => {
  it("detects strict undercut", () => {
    expect(isUndercut(300, 250)).toBe(true);
  });

  it("no alert on equal prices", () => {
    expect(isUndercut(300, 300)).toBe(false);
  });

  it("no alert when competitor higher", () => {
    expect(isUndercut(250, 300)).toBe(false);
  });
});
