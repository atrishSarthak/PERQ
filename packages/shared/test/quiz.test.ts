import { describe, expect, it } from "vitest";
import {
  normalizeStoredAnswers,
  quizAnswersV2Schema,
  shouldAskOpenToSecured,
  SPEND_BUCKET_RUPEES,
  travelMonthlySpend,
  type QuizAnswersV2,
} from "../src";

export const sampleV2: QuizAnswersV2 = {
  schemaVersion: 2,
  cardsHeld: [],
  occupation: "salaried",
  monthlyIncome: "50k_1l",
  monthlySpend: { food_delivery: "3k_6k", online_shopping: "1k_3k", groceries: "1k_3k", dining: "lt_1k", fuel: "0", bills: "1k_3k", upi: "lt_1k" },
  travelPerYear: "1_2",
  feeTolerance: "upto_1000",
  priorities: ["cashback"],
  openToSecured: null,
};

const v1 = {
  heldCardIds: ["sbi-cashback"],
  annualIncome: "6-10l",
  flightFrequency: "1-2",
  hotelFrequency: "3-5",
  gymMembership: "none",
  foodDeliverySpend: "6k+",
  ecommerceSpend: "1-3k",
  grocerySpend: "<1k",
  diningOutSpend: "3-6k",
  fuelSpend: "<1k",
  recurringBillsByCard: "yes",
  feeTolerant: false,
  priorityCategories: ["dining", "hotels"],
  creditScoreRange: null,
};

describe("quiz v2", () => {
  it("accepts a complete v2 answer set and rejects a third priority", () => {
    expect(quizAnswersV2Schema.safeParse(sampleV2).success).toBe(true);
    expect(quizAnswersV2Schema.safeParse({ ...sampleV2, priorities: ["cashback", "travel", "fuel"] }).success).toBe(false);
  });

  it("asks the FD question only for students or income below ₹25k", () => {
    expect(shouldAskOpenToSecured({ occupation: "student", monthlyIncome: "2l_plus" })).toBe(true);
    expect(shouldAskOpenToSecured({ occupation: "salaried", monthlyIncome: "below_25k" })).toBe(true);
    expect(shouldAskOpenToSecured({ occupation: "salaried", monthlyIncome: "25k_50k" })).toBe(false);
  });

  it("maps buckets to the documented midpoints", () => {
    expect(SPEND_BUCKET_RUPEES["1k_3k"]).toBe(2000);
    expect(SPEND_BUCKET_RUPEES["6k_plus"]).toBe(8000);
    expect(travelMonthlySpend("3_5")).toBe(4000); // 4 trips × ₹12,000 / 12
  });
});

describe("normalizeStoredAnswers", () => {
  it("passes v2 through untouched", () => {
    expect(normalizeStoredAnswers(sampleV2)).toEqual({ kind: "v2", answers: sampleV2, needsConfirmation: [] });
  });

  it("maps a v1 profile and flags what the user must confirm", () => {
    const r = normalizeStoredAnswers(v1);
    expect(r.kind).toBe("migrated");
    expect(r.answers).toMatchObject({
      schemaVersion: 2,
      cardsHeld: ["sbi-cashback"],
      monthlyIncome: "50k_1l",
      travelPerYear: "3_5",
      feeTolerance: "zero",
      priorities: ["dining", "travel"],
      monthlySpend: { food_delivery: "6k_plus", dining: "3k_6k", bills: "1k_3k", upi: "0" },
    });
    expect(quizAnswersV2Schema.safeParse(r.answers).success).toBe(true);
    expect(r.needsConfirmation).toEqual(expect.arrayContaining(["occupation", "monthlySpend"]));
  });

  it("asks to confirm income when v1 said 'prefer not to say'", () => {
    expect(normalizeStoredAnswers({ ...v1, annualIncome: "prefer-not-to-say" }).needsConfirmation).toContain("monthlyIncome");
  });

  it("never throws on garbage", () => {
    for (const raw of [null, undefined, 42, "x", {}, { schemaVersion: 2 }, { heldCardIds: "nope" }]) {
      expect(normalizeStoredAnswers(raw).kind).toBe("invalid");
    }
  });
});
