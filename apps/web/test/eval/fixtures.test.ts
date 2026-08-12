import { describe, expect, it } from "vitest";
import { scoreCards } from "@perq/scoring-engine";
import { FIXTURES } from "@/eval/fixtures";

/**
 * The eval suite's deterministic-ranking assumption is a hard prerequisite
 * for its Gemini-grounding checks to mean anything (mimir-explanations.eval.ts
 * runs live, hits the real Gemini API, and costs free-tier quota — this
 * test verifies each fixture's expectedTopCardId against the real,
 * deterministic scoreCards() at zero cost, on every regular test run,
 * instead of only discovering a fixture math error mid-eval-run).
 */
describe("eval fixtures — deterministic ranking matches each fixture's expectation", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: scoreCards ranks ${fixture.expectedTopCardId} first`, () => {
      const scored = scoreCards(fixture.profile, fixture.cards).filter((s) => s.eligible);
      expect(scored[0]?.card.id).toBe(fixture.expectedTopCardId);
    });
  }

  it("every fixture's expectedGroundedNumber is a real annual reward or milestone value present in its own cards", () => {
    for (const fixture of FIXTURES) {
      const scored = scoreCards(fixture.profile, fixture.cards).filter((s) => s.eligible);
      const top = scored[0];
      expect(top).toBeDefined();
      const candidateNumbers = [
        ...top!.breakdown.map((b) => Math.round(b.annualValue).toString()),
        Math.round(top!.milestoneValue).toString(),
      ];
      expect(candidateNumbers).toContain(fixture.expectedGroundedNumber);
    }
  });
});
