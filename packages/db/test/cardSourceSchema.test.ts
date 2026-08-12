import { describe, expect, it } from "vitest";
import { cardSourceFileSchema, cardSourceSchema } from "../scripts/cardSourceSchema";

const validCard = {
  id: "test-card",
  name: "Test Card",
  issuer: "TestBank",
  network: "Visa",
  joiningFee: 0,
  annualFee: 500,
  rewardRates: { dining: 0.05 },
};

describe("cardSourceSchema", () => {
  it("accepts a minimal valid card (optional fields omitted)", () => {
    expect(cardSourceSchema.safeParse(validCard).success).toBe(true);
  });

  it("defaults milestoneBenefits to an empty array when omitted", () => {
    const result = cardSourceSchema.parse(validCard);
    expect(result.milestoneBenefits).toEqual([]);
  });

  it("rejects an unknown network value", () => {
    const result = cardSourceSchema.safeParse({ ...validCard, network: "Diners Club" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative annualFee", () => {
    const result = cardSourceSchema.safeParse({ ...validCard, annualFee: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects a card with no id (stable id required for re-seeding, PRD §7)", () => {
    const { id, ...withoutId } = validCard;
    const result = cardSourceSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("cardSourceFileSchema validates an array of cards", () => {
    const result = cardSourceFileSchema.safeParse([validCard, { ...validCard, id: "card-2" }]);
    expect(result.success).toBe(true);
  });
});
