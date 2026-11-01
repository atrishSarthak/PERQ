import { describe, expect, it } from "vitest";
import { CATEGORY_KEYS, TXN_CATEGORIES, TXN_CATEGORY_LABELS, TXN_TO_RECOMMENDER } from "../src";

describe("money vocabularies", () => {
  it("starts with the recommender's categories so real spend maps straight on", () => {
    for (const c of CATEGORY_KEYS) expect(TXN_CATEGORIES).toContain(c);
  });
  it("labels and maps every transaction category to a recommender category or null", () => {
    for (const c of TXN_CATEGORIES) {
      expect(TXN_CATEGORY_LABELS[c]).toBeTruthy();
      const m = TXN_TO_RECOMMENDER[c];
      expect(m === null || (CATEGORY_KEYS as readonly string[]).includes(m)).toBe(true);
    }
  });
});
