import { describe, expect, it } from "vitest";
import { buildTemplateExplanation } from "@/lib/mimir/explanationTemplate";
import type { ScoredCard } from "@perq/scoring-engine";

function makeScoredCard(overrides: Partial<ScoredCard> = {}): ScoredCard {
  return {
    card: {
      id: "card-1",
      annualFee: 500,
      rewardRates: {
        dining: 0,
        travel: 0,
        hotels: 0,
        fuel: 0,
        groceries: 0,
        ecommerce: 0,
        utilities: 0,
        general: 0,
      },
      milestoneBenefits: [],
      minIncomeEligibility: null,
    },
    score: 100,
    breakdown: [],
    milestoneValue: 0,
    priorityBoost: 0,
    eligible: true,
    ...overrides,
  };
}

describe("buildTemplateExplanation (D7 fallback + rank>1 template)", () => {
  it("names the real card and the strongest category with a real ₹ amount", () => {
    const scored = makeScoredCard({
      breakdown: [
        { category: "dining", monthlySpend: 4200, rewardRate: 0.05, annualValue: 2520 },
        { category: "fuel", monthlySpend: 1000, rewardRate: 0.01, annualValue: 120 },
      ],
    });
    const text = buildTemplateExplanation(scored, "Axis Airtel");
    expect(text).toContain("Axis Airtel");
    expect(text).toContain("dining");
    expect(text).toContain("4200");
  });

  it("picks the highest-value category, not just the first in the breakdown", () => {
    const scored = makeScoredCard({
      breakdown: [
        { category: "fuel", monthlySpend: 500, rewardRate: 0.01, annualValue: 60 },
        { category: "travel", monthlySpend: 3000, rewardRate: 0.06, annualValue: 2160 },
      ],
    });
    const text = buildTemplateExplanation(scored, "Test Card");
    expect(text).toContain("travel");
    expect(text).not.toContain("fuel");
  });

  it("falls back to a generic overall-spend message when no category has positive value", () => {
    const scored = makeScoredCard({ breakdown: [] });
    const text = buildTemplateExplanation(scored, "Test Card");
    expect(text).toContain("Test Card");
    expect(text).toContain("overall spend pattern");
  });

  it("never produces a bare score with no explanation (Design System §5)", () => {
    const scored = makeScoredCard({ breakdown: [] });
    const text = buildTemplateExplanation(scored, "Test Card");
    expect(text).not.toMatch(/^\d+$/);
    expect(text.length).toBeGreaterThan(20);
  });
});
