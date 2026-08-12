import { describe, expect, it } from "vitest";
import { emptyFilters, filterCards, sortCards } from "@/app/(shell)/results/filterAndSort";
import type { ResultsCard } from "@/app/(shell)/results/types";

function makeCard(overrides: Partial<ResultsCard> = {}): ResultsCard {
  return {
    cardId: "card-1",
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    annualFee: 500,
    joiningFee: 0,
    rewardRates: { dining: 0.05 },
    loungeAccess: null,
    recommendation: { rank: 1, score: 100, explanation: "test" },
    arsenalStatus: undefined,
    ...overrides,
  };
}

describe("filterCards", () => {
  it("returns all cards when filters are empty", () => {
    const cardsList = [makeCard({ cardId: "a" }), makeCard({ cardId: "b" })];
    expect(filterCards(cardsList, emptyFilters())).toHaveLength(2);
  });

  it("filters by network", () => {
    const cardsList = [
      makeCard({ cardId: "a", network: "Visa" }),
      makeCard({ cardId: "b", network: "RuPay" }),
    ];
    const filters = { ...emptyFilters(), networks: new Set(["RuPay"]) };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["b"]);
  });

  it("filters by issuer", () => {
    const cardsList = [
      makeCard({ cardId: "a", issuer: "Axis" }),
      makeCard({ cardId: "b", issuer: "HDFC" }),
    ];
    const filters = { ...emptyFilters(), issuers: new Set(["HDFC"]) };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["b"]);
  });

  it("filters to zero joining fee only", () => {
    const cardsList = [
      makeCard({ cardId: "a", joiningFee: 0 }),
      makeCard({ cardId: "b", joiningFee: 500 }),
    ];
    const filters = { ...emptyFilters(), zeroFeeOnly: true };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["a"]);
  });

  it("filters to held-only cards", () => {
    const cardsList = [
      makeCard({ cardId: "a", arsenalStatus: "held" }),
      makeCard({ cardId: "b", arsenalStatus: "not_held" }),
      makeCard({ cardId: "c", arsenalStatus: undefined }),
    ];
    const filters = { ...emptyFilters(), showHeldOnly: true };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["a"]);
  });

  it("filters by category — matches any selected category with a positive reward rate", () => {
    const cardsList = [
      makeCard({ cardId: "a", rewardRates: { dining: 0.05, travel: 0 } }),
      makeCard({ cardId: "b", rewardRates: { dining: 0, travel: 0.06 } }),
      makeCard({ cardId: "c", rewardRates: { dining: 0, travel: 0 } }),
    ];
    const filters = { ...emptyFilters(), categories: new Set(["dining", "travel"]) };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["a", "b"]);
  });

  it("combines multiple filters with AND semantics", () => {
    const cardsList = [
      makeCard({ cardId: "a", network: "Visa", joiningFee: 0 }),
      makeCard({ cardId: "b", network: "Visa", joiningFee: 500 }),
      makeCard({ cardId: "c", network: "RuPay", joiningFee: 0 }),
    ];
    const filters = { ...emptyFilters(), networks: new Set(["Visa"]), zeroFeeOnly: true };
    expect(filterCards(cardsList, filters).map((c) => c.cardId)).toEqual(["a"]);
  });
});

describe("sortCards", () => {
  it("excludes cards with no recommendation (not eligible/not scored) from every sort", () => {
    const cardsList = [
      makeCard({ cardId: "a", recommendation: { rank: 1, score: 100, explanation: "x" } }),
      makeCard({ cardId: "b", recommendation: undefined }),
    ];
    expect(sortCards(cardsList, "best-match").map((c) => c.cardId)).toEqual(["a"]);
  });

  it("best-match sorts by MIMIR's authored rank ascending", () => {
    const cardsList = [
      makeCard({ cardId: "a", recommendation: { rank: 2, score: 50, explanation: "x" } }),
      makeCard({ cardId: "b", recommendation: { rank: 1, score: 10, explanation: "x" } }),
    ];
    expect(sortCards(cardsList, "best-match").map((c) => c.cardId)).toEqual(["b", "a"]);
  });

  it("lowest-fee sorts by annualFee ascending", () => {
    const cardsList = [
      makeCard({ cardId: "a", annualFee: 1000, recommendation: { rank: 1, score: 1, explanation: "x" } }),
      makeCard({ cardId: "b", annualFee: 0, recommendation: { rank: 2, score: 1, explanation: "x" } }),
    ];
    expect(sortCards(cardsList, "lowest-fee").map((c) => c.cardId)).toEqual(["b", "a"]);
  });

  it("highest-rewards sorts by score descending", () => {
    const cardsList = [
      makeCard({ cardId: "a", recommendation: { rank: 1, score: 50, explanation: "x" } }),
      makeCard({ cardId: "b", recommendation: { rank: 2, score: 200, explanation: "x" } }),
    ];
    expect(sortCards(cardsList, "highest-rewards").map((c) => c.cardId)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const cardsList = [
      makeCard({ cardId: "a", recommendation: { rank: 2, score: 1, explanation: "x" } }),
      makeCard({ cardId: "b", recommendation: { rank: 1, score: 1, explanation: "x" } }),
    ];
    const original = [...cardsList];
    sortCards(cardsList, "best-match");
    expect(cardsList).toEqual(original);
  });
});
