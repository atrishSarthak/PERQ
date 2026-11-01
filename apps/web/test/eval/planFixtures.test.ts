import { describe, expect, it } from "vitest";
import { EXPLAIN_FIXTURES, SCREENSHOTS } from "../../eval/planFixtures";

// Offline half of the planner eval: each explanation fixture opens the verdict
// it's meant to test. The live half (Gemini) runs with `pnpm eval:plans`.
describe("planner eval fixtures", () => {
  it("has 10 fixtures: one per verdict, a missing price, 5 screenshots", () => {
    expect(EXPLAIN_FIXTURES.length + 1 + SCREENSHOTS.length).toBe(10);
    expect(new Set(EXPLAIN_FIXTURES.map((f) => f.expect)).size).toBe(4);
  });

  for (const f of EXPLAIN_FIXTURES) {
    it(`"${f.name}" → ${f.expect}`, () => {
      expect(f.result.verdict).toBe(f.expect);
    });
  }
});
