import { describe, expect, it } from "vitest";
import {
  estimateSpendFromBucket,
  estimateSpendFromFrequency,
} from "../src/estimateSpendFromBucket";
import type { SpendBucket } from "../src/types";

describe("estimateSpendFromBucket", () => {
  it("returns the midpoint estimate for each bucket", () => {
    expect(estimateSpendFromBucket("<1k")).toBe(500);
    expect(estimateSpendFromBucket("1-3k")).toBe(2000);
    expect(estimateSpendFromBucket("3-6k")).toBe(4500);
    expect(estimateSpendFromBucket("6k+")).toBe(7500);
  });

  it("throws on an unknown/malformed bucket", () => {
    expect(() => estimateSpendFromBucket("bogus" as SpendBucket)).toThrow(
      /Unknown spend bucket/
    );
  });
});

describe("estimateSpendFromFrequency", () => {
  it("returns 0 for never", () => {
    expect(estimateSpendFromFrequency("never", 8000)).toBe(0);
  });

  it("scales monthly estimate with occurrence count and per-occurrence value", () => {
    expect(estimateSpendFromFrequency("1-2", 12000)).toBeCloseTo((1.5 * 12000) / 12);
    expect(estimateSpendFromFrequency("6+", 1000)).toBeCloseTo((8 * 1000) / 12);
  });

  it("throws on an unknown frequency bucket", () => {
    expect(() =>
      estimateSpendFromFrequency("bogus" as never, 1000)
    ).toThrow(/Unknown frequency bucket/);
  });
});
