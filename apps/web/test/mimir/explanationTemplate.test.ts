import { describe, expect, it } from "vitest";
import {
  buildTemplateExplanation,
  buildTopPickTemplateExplanation,
} from "@/lib/mimir/explanationTemplate";
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

  it("frames every ₹ figure as an estimate, never a bare stated fact", () => {
    const scored = makeScoredCard({
      breakdown: [{ category: "fuel", monthlySpend: 5333, rewardRate: 0.02, annualValue: 1280 }],
    });
    const text = buildTemplateExplanation(scored, "Test Card");
    expect(text).toMatch(/estimat|roughly|~₹/);
    // Rounded to the nearest ₹100, not the raw 5333 — less falsely precise.
    expect(text).toContain("5300");
    expect(text).not.toContain("5333");
  });
});

describe("buildTopPickTemplateExplanation (the top pick's longer explanation)", () => {
  it("is meaningfully longer than the short per-card template", () => {
    const scored = makeScoredCard({
      breakdown: [
        { category: "dining", monthlySpend: 4200, rewardRate: 0.05, annualValue: 2520 },
        { category: "travel", monthlySpend: 3000, rewardRate: 0.03, annualValue: 1080 },
      ],
    });
    const shortText = buildTemplateExplanation(scored, "Test Card");
    const longText = buildTopPickTemplateExplanation(scored, "Test Card");
    expect(longText.length).toBeGreaterThan(shortText.length);
    // At least the opening + secondary-category + fee sentences.
    expect(longText.split(". ").length).toBeGreaterThanOrEqual(3);
  });

  it("mentions the runner-up category when one has positive value", () => {
    const scored = makeScoredCard({
      breakdown: [
        { category: "dining", monthlySpend: 4200, rewardRate: 0.05, annualValue: 2520 },
        { category: "travel", monthlySpend: 3000, rewardRate: 0.03, annualValue: 1080 },
      ],
    });
    const text = buildTopPickTemplateExplanation(scored, "Test Card");
    expect(text).toContain("dining");
    expect(text).toContain("travel");
  });

  it("mentions the ₹0 fee when the card is free to hold", () => {
    const scored = makeScoredCard({
      card: {
        id: "card-1",
        annualFee: 0,
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
      breakdown: [{ category: "dining", monthlySpend: 4200, rewardRate: 0.05, annualValue: 2520 }],
    });
    const text = buildTopPickTemplateExplanation(scored, "Test Card");
    expect(text).toMatch(/costs nothing|no downside/);
  });

  it("mentions the milestone spend threshold when the card has one", () => {
    const scored = makeScoredCard({
      card: {
        id: "card-1",
        annualFee: 2500,
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
        milestoneBenefits: [{ spendThreshold: 300000, bonusValue: 5000 }],
        minIncomeEligibility: null,
      },
      breakdown: [{ category: "dining", monthlySpend: 4200, rewardRate: 0.05, annualValue: 2520 }],
      milestoneValue: 5000,
    });
    const text = buildTopPickTemplateExplanation(scored, "Test Card");
    expect(text).toContain("3,00,000");
  });

  it("never produces a bare score with no explanation, even with an empty breakdown", () => {
    const scored = makeScoredCard({ breakdown: [] });
    const text = buildTopPickTemplateExplanation(scored, "Test Card");
    expect(text).toContain("Test Card");
    expect(text.length).toBeGreaterThan(20);
  });
});
