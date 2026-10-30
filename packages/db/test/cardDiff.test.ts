import { describe, expect, it } from "vitest";
import type { CatalogCard } from "@perq/shared";
import { sameCatalogCard, stableStringify } from "../scripts/cardDiff";

const card: CatalogCard = {
  id: "c", name: "Card", issuer: "Bank", networks: ["Visa"], bucket: "entry_cashback", tier: null,
  cardType: "unsecured", fdMinAmount: null, lifetimeFree: false, upiEnabled: false,
  joiningFee: 500, annualFee: 500, feeWaiverSpend: 200000, waiverExcludes: [],
  rewardRates: { dining: 1, other: 1 }, rewardCaps: { dining: 100 }, capGroups: [],
  rewardNotes: "n", milestones: [{ annualSpend: 1, value: 2 }], welcomeBenefitValue: 0,
  redemptionValue: null, coBrandPartner: null, minAge: 21, eligibleOccupations: null,
  minMonthlyIncome: null, sourceUrl: "https://bank.example/card", sourceUpdatedAt: "2026-10-31", verified: true,
};

describe("cardDiff", () => {
  it("ignores jsonb key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it("treats identical cards as unchanged regardless of key order", () => {
    const reordered = { ...card, rewardRates: { other: 1, dining: 1 } };
    expect(sameCatalogCard(card, reordered)).toBe(true);
  });
  it("detects a changed fee, rate or checked date", () => {
    expect(sameCatalogCard(card, { ...card, annualFee: 999 })).toBe(false);
    expect(sameCatalogCard(card, { ...card, rewardRates: { dining: 2, other: 1 } })).toBe(false);
    expect(sameCatalogCard(card, { ...card, sourceUpdatedAt: "2026-11-30" })).toBe(false);
  });
});
