import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recommend } from "@perq/scoring-engine";
import { catalogFileSchema } from "@perq/shared";
import { FIXTURES } from "../../eval/fixtures";

// Offline half of the Ember eval: the deterministic ranking each fixture
// relies on. The live half (Gemini) runs with `pnpm eval`.
const catalogue = catalogFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, "../../../../packages/db/data/cards.json"), "utf-8"))
);

describe("Ember eval fixtures", () => {
  it("has 10 fixtures, 3 of them 'why not X?' questions", () => {
    expect(FIXTURES).toHaveLength(10);
    expect(FIXTURES.filter((f) => f.whyNotCardId)).toHaveLength(3);
  });

  for (const f of FIXTURES) {
    it(`ranks ${f.expectedTopCardId} first for "${f.name}"`, () => {
      expect(recommend(f.answers, catalogue).ranked[0]?.cardId).toBe(f.expectedTopCardId);
    });
  }
});
