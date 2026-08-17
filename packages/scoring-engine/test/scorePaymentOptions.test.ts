import { describe, expect, it } from "vitest";
import { scorePaymentOptions } from "../src/scorePaymentOptions";
import type { ArsenalCard, FinancialContext, PurchaseOffer } from "../src/types";

const NO_CONTEXT: FinancialContext = {};

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
  it("resolves to a source-only option when the arsenal is empty", () => {
    const offers: PurchaseOffer[] = [{ source: "amazon", price: 1000 }];
    const options = scorePaymentOptions(offers, [], "ecommerce", NO_CONTEXT, null);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      source: "amazon",
      cardId: null,
      paymentMethod: "no_card",
      adjustedCost: 1000,
    });
  });

  it("skips billing-cycle and utilization reasoning when financial-context fields are missing", () => {
    const offers: PurchaseOffer[] = [{ source: "amazon", price: 1000 }];
    const cards = [card("c1", "Card A", 0.02)];
    const options = scorePaymentOptions(offers, cards, "ecommerce", NO_CONTEXT, null);

    for (const opt of options) {
      expect(opt.billingCycleNote).toBeNull();
      expect(opt.utilizationWarning).toBe(false);
    }
  });

  it("recommends the reward-bearing card over the raw listed price, not a bare price comparison", () => {
    // A naive "cheapest raw price" comparison would just report flipkart at
    // ₹1000. The real recommendation must be reward-adjusted: flipkart PLUS
    // the 10%-reward card, at a materially lower effective cost than the raw
    // price alone — never the "no card" baseline when a real reward is
    // available.
    const offers: PurchaseOffer[] = [
      { source: "flipkart", price: 1000 },
      { source: "amazon", price: 1050 },
    ];
    const cards = [card("c1", "10pct Card", 0.1)];
    const options = scorePaymentOptions(offers, cards, "ecommerce", NO_CONTEXT, null);

    const winner = options[0]!;
    expect(winner.source).toBe("flipkart");
    expect(winner.cardId).toBe("c1"); // not the "no card" baseline
    expect(winner.paymentMethod).toBe("card");
    expect(winner.effectiveCost).toBeCloseTo(900); // 1000 * (1 - 0.1)
    expect(winner.effectiveCost).toBeLessThan(1000); // materially below raw price
  });

  it("flips the recommendation to 'pay another way' when using the card would push utilization too high", () => {
    // A small 2% reward card nominally beats "no card" (4900 < 5000), but
    // reported utilization is already near the credit limit — the
    // utilization penalty should flip the recommendation to NOT using a
    // card at all.
    const offers: PurchaseOffer[] = [{ source: "amazon", price: 5000 }];
    const cards = [card("c1", "Low-reward Card", 0.02)];
    const context: FinancialContext = { outstandingBalance: 45000, creditLimit: 50000 };
    // (45000 + 5000) / 50000 = 1.0 -> over the 0.7 threshold -> penalty applied

    const options = scorePaymentOptions(offers, cards, "ecommerce", context, null);
    const winner = options[0]!;

    expect(winner.cardId).toBeNull(); // "pay another way" wins over the card
    expect(winner.paymentMethod).toBe("no_card");
    const cardOption = options.find((o) => o.cardId === "c1")!;
    expect(cardOption.utilizationWarning).toBe(true);
    expect(cardOption.adjustedCost).toBeGreaterThan(winner.adjustedCost);
  });

  it("generates a billing-cycle note when the statement closes within the advice window", () => {
    const offers: PurchaseOffer[] = [{ source: "amazon", price: 1000 }];
    const cards = [card("c1", "Card A", 0.02)];
    const today = new Date(2026, 7, 16); // Aug 16, 2026
    const context: FinancialContext = { statementDate: 19 }; // 3 days away

    const options = scorePaymentOptions(offers, cards, "ecommerce", context, null, today);
    expect(options[0]!.billingCycleNote).toContain("3 days");
  });

  it("omits the billing-cycle note when the statement close is outside the advice window", () => {
    const offers: PurchaseOffer[] = [{ source: "amazon", price: 1000 }];
    const today = new Date(2026, 7, 16);
    const context: FinancialContext = { statementDate: 1 }; // ~16 days away

    const options = scorePaymentOptions(offers, [], "ecommerce", context, null, today);
    expect(options[0]!.billingCycleNote).toBeNull();
  });

  it("scores directly against the classified SpendCategory, no intermediate mapping", () => {
    const offers: PurchaseOffer[] = [{ source: "bookmyshow", price: 500 }];
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
    const options = scorePaymentOptions(offers, cards, "general", NO_CONTEXT, null);
    const withCard = options.find((o) => o.cardId === "c1")!;
    expect(withCard.rewardValue).toBeCloseTo(40); // 500 * 0.08
  });

  describe("BNPL", () => {
    it("does not generate a BNPL option below the ₹15,000 threshold", () => {
      const offers: PurchaseOffer[] = [{ source: "amazon", price: 14999 }];
      const options = scorePaymentOptions(offers, [], "ecommerce", NO_CONTEXT, null);
      expect(options.some((o) => o.paymentMethod === "bnpl")).toBe(false);
    });

    it("generates a BNPL option at or above the ₹15,000 threshold, with no utilization penalty", () => {
      const offers: PurchaseOffer[] = [{ source: "amazon", price: 20000 }];
      const options = scorePaymentOptions(offers, [], "ecommerce", NO_CONTEXT, null);
      const bnpl = options.find((o) => o.paymentMethod === "bnpl")!;
      expect(bnpl).toBeDefined();
      expect(bnpl.adjustedCost).toBe(20000);
      expect(bnpl.utilizationWarning).toBe(false);
      expect(bnpl.bnplNote).toBeTruthy();
    });

    it("lets BNPL win over a card whose utilization penalty outweighs its reward value", () => {
      // A card earning a small reward but crossing the utilization threshold
      // should adjustedCost-lose to BNPL, which carries no such penalty —
      // BNPL wins because of the quantified penalty, never an arbitrary
      // bonus.
      const offers: PurchaseOffer[] = [{ source: "amazon", price: 20000 }];
      const cards = [card("c1", "Low-reward Card", 0.01)];
      const context: FinancialContext = { outstandingBalance: 40000, creditLimit: 50000 };
      // (40000 + 20000) / 50000 = 1.2 -> over threshold -> penalty applied

      const options = scorePaymentOptions(offers, cards, "ecommerce", context, null);
      const winner = options[0]!;
      expect(winner.paymentMethod).toBe("bnpl");
    });

    it("uses a citation-backed BNPL note verbatim when discovery found one", () => {
      const offers: PurchaseOffer[] = [{ source: "amazon", price: 20000 }];
      const realNote = "Amazon Pay Later offers no-cost EMI on this purchase.";
      const options = scorePaymentOptions(offers, [], "ecommerce", NO_CONTEXT, realNote);
      const bnpl = options.find((o) => o.paymentMethod === "bnpl")!;
      expect(bnpl.bnplNote).toBe(realNote);
    });
  });
});
