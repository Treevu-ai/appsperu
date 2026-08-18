import { describe, expect, it } from "vitest";
import { isBelowReviewThreshold } from "@/lib/signals";

describe("isBelowReviewThreshold", () => {
  it("is true for a percentile below 10", () => {
    expect(isBelowReviewThreshold(9)).toBe(true);
    expect(isBelowReviewThreshold(0)).toBe(true);
  });

  it("is false at or above the threshold", () => {
    expect(isBelowReviewThreshold(10)).toBe(false);
    expect(isBelowReviewThreshold(50)).toBe(false);
  });
});
