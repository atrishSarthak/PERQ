import { describe, expect, it } from "vitest";
import { quizAnswersSchema } from "@/lib/mimir/quizAnswersSchema";

const validAnswers = {
  heldCardIds: [],
  annualIncome: "6-10l",
  flightFrequency: "3-5",
  hotelFrequency: "1-2",
  gymMembership: "none",
  foodDeliverySpend: "3-6k",
  ecommerceSpend: "1-3k",
  grocerySpend: "1-3k",
  diningOutSpend: "3-6k",
  fuelSpend: "1-3k",
  recurringBillsByCard: "yes",
  feeTolerant: true,
  priorityCategories: ["dining", "travel"],
};

describe("quizAnswersSchema", () => {
  it("accepts a fully valid answer set", () => {
    const result = quizAnswersSchema.safeParse(validAnswers);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { fuelSpend, ...missing } = validAnswers;
    const result = quizAnswersSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid bucket value not in the enum", () => {
    const invalid = { ...validAnswers, fuelSpend: "way too much" };
    const result = quizAnswersSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 priority categories (PRD §8 Q13: pick up to 2)", () => {
    const invalid = {
      ...validAnswers,
      priorityCategories: ["dining", "travel", "fuel"],
    };
    const result = quizAnswersSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts zero priority categories (no preference is valid)", () => {
    const valid = { ...validAnswers, priorityCategories: [] };
    const result = quizAnswersSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts an empty heldCardIds array (Q1: I don't have any yet)", () => {
    const valid = { ...validAnswers, heldCardIds: [] };
    const result = quizAnswersSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a non-boolean feeTolerant value", () => {
    const invalid = { ...validAnswers, feeTolerant: "yes" };
    const result = quizAnswersSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
