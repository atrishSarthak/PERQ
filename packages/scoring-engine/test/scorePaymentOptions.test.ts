import { describe, expect, it } from "vitest";
import { scorePaymentOptions } from "../src/scorePaymentOptions";
import type { ArsenalCard, ChannelResult, FinancialContext } from "../src/types";

const NO_CONTEXT: FinancialContext = {};

// electronics maps to 'ecommerce' per scorePaymentOptions' internal mapping
// (CATEGORY_TO_REWARD_CATEGORY) — these fixtures set the ecommerce rate
// directly since every test in this file uses category "electronics".
function card(id: string, name: string, ecommerceRate: number): ArsenalCard {
  return {
    id,
    name,
    rewardRates: {
      dining: 0,
      travel: 0,
      hotels: 0,
      fuel: 0,
      groceries: 0,
      ecommerce: ecommerceRate,
      utilities: 0,
      general: 0,
    },
  };
}

describe("scorePaymentOptions", () => {
  it("resolves to a channel-only option when the arsenal is empty", () => {
    const results: ChannelResult[] = [{ channel: "amazon", price: 1000 }];
    const options = scorePaymentOptions(results, [], "electronics", NO_CONTEXT);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ channel: "amazon", cardId: null, adjustedCost: 1000 });
  });

  it("skips billing-cycle and utilization reasoning when financial-context fields are missing", () => {
    const results: ChannelResult[] = [{ channel: "amazon", price: 1000 }];
    const cards = [card("c1", "Card A", 0.02)];
    const options = scorePaymentOptions(results, cards, "electronics", NO_CONTEXT);

    for (const opt of options) {
      expect(opt.billingCycleNote).toBeNull();
      expect(opt.utilizationWarning).toBe(false);
    }
  });

  it("recommends the reward-bearing card over the raw listed price, not a bare price comparison", () => {
    // A naive "cheapest raw price" comparison would just report flipkart at
    // ₹1000. The real recommendation must be reward-adjusted: flipkart
    // PLUS the 10%-reward card, at a materially lower effective cost than
    // the raw price alone — never the "no card" baseline when a real
    // reward is available (PRD §15: cheapest raw price isn't the whole
    // story once a card reward is factored in).
    const results: ChannelResult[] = [
      { channel: "flipkart", price: 1000 },
      { channel: "amazon", price: 1050 },
    ];
    const cards = [card("c1", "10pct Card", 0.1)];
    const options = scorePaymentOptions(results, cards, "electronics", NO_CONTEXT);

    const winner = options[0]!;
    expect(winner.channel).toBe("flipkart");
    expect(winner.cardId).toBe("c1"); // not the "no card" baseline
    expect(winner.effectiveCost).toBeCloseTo(900); // 1000 * (1 - 0.1)
    expect(winner.effectiveCost).toBeLessThan(1000); // materially below raw price
  });

  it("flips the recommendation to 'pay another way' when using the card would push utilization too high", () => {
    // A small 2% reward card nominally beats "no card" (4900 < 5000), but
    // reported utilization is already near the credit limit — the
    // utilization penalty should flip the recommendation to NOT using a
    // card at all, the way an informed friend would caution against
    // maxing out a card for a marginal reward.
    const results: ChannelResult[] = [{ channel: "amazon", price: 5000 }];
    const cards = [card("c1", "Low-reward Card", 0.02)];
    const context: FinancialContext = { outstandingBalance: 45000, creditLimit: 50000 };
    // (45000 + 5000) / 50000 = 1.0 -> over the 0.7 threshold -> penalty applied

    const options = scorePaymentOptions(results, cards, "electronics", context);
    const winner = options[0]!;

    expect(winner.cardId).toBeNull(); // "pay another way" wins over the card
    const cardOption = options.find((o) => o.cardId === "c1")!;
    expect(cardOption.utilizationWarning).toBe(true);
    expect(cardOption.adjustedCost).toBeGreaterThan(winner.adjustedCost);
  });

  it("generates a billing-cycle note when the statement closes within the advice window", () => {
    const results: ChannelResult[] = [{ channel: "amazon", price: 1000 }];
    const cards = [card("c1", "Card A", 0.02)];
    const today = new Date(2026, 7, 16); // Aug 16, 2026
    const context: FinancialContext = { statementDate: 19 }; // 3 days away

    const options = scorePaymentOptions(results, cards, "electronics", context, today);
    expect(options[0]!.billingCycleNote).toContain("3 days");
  });

  it("omits the billing-cycle note when the statement close is outside the advice window", () => {
    const results: ChannelResult[] = [{ channel: "amazon", price: 1000 }];
    const today = new Date(2026, 7, 16);
    const context: FinancialContext = { statementDate: 1 }; // ~16 days away

    const options = scorePaymentOptions(results, [], "electronics", context, today);
    expect(options[0]!.billingCycleNote).toBeNull();
  });

  it("maps categories to the closest existing reward category (movie -> general, attraction -> travel)", () => {
    const results: ChannelResult[] = [{ channel: "bookmyshow", price: 500 }];
    const cards: ArsenalCard[] = [
      {
        id: "c1",
        name: "General Rewards Card",
        rewardRates: {
          dining: 0,
          travel: 0,
          hotels: 0,
          fuel: 0,
          groceries: 0,
          ecommerce: 0,
          utilities: 0,
          general: 0.08,
        },
      },
    ];
    const options = scorePaymentOptions(results, cards, "movie", NO_CONTEXT);
    const withCard = options.find((o) => o.cardId === "c1")!;
    expect(withCard.rewardValue).toBeCloseTo(40); // 500 * 0.08
  });
});
