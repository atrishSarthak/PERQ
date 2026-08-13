import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QuizAnswers } from "@perq/scoring-engine";

const searchGroundedTextMock = vi.fn();
const extractStructuredJsonMock = vi.fn();

vi.mock("@perq/ai", () => ({
  searchGroundedText: (...args: unknown[]) => searchGroundedTextMock(...args),
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
}));

const { searchCardsForBucket, buildCardSearchQuery, MAX_SEARCH_CARDS } = await import(
  "@/lib/mimir/cardSearch"
);

const answers: QuizAnswers = {
  heldCardIds: [],
  annualIncome: "6-12l",
  flightFrequency: "3-5",
  hotelFrequency: "1-2",
  gymMembership: { active: false, monthlyCost: null },
  foodDeliverySpend: "3-6k",
  ecommerceSpend: "1-3k",
  grocerySpend: "1-3k",
  diningOutSpend: "3-6k",
  fuelSpend: "1-3k",
  recurringBillsByCard: true,
  feeTolerant: true,
  priorityCategories: ["dining", "travel"],
};

const CITATIONS = [
  { uri: "https://bank-a.example/card-a", title: "Card A" },
  { uri: "https://bank-b.example/card-b", title: "Card B" },
];

function makeRawCard(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    joiningFee: 500,
    annualFee: 500,
    rewardRates: { dining: 0.02 },
    sourceUrls: ["https://bank-a.example/card-a"],
    ...overrides,
  };
}

describe("buildCardSearchQuery", () => {
  it("mentions income bracket, priority categories, and fee tolerance", () => {
    const query = buildCardSearchQuery(answers);
    expect(query).toContain("6-12l");
    expect(query).toContain("dining");
    expect(query).toContain("travel");
    expect(query).toContain("annual fee");
  });

  it("falls back to 'everyday spending' when no priority categories are set", () => {
    const query = buildCardSearchQuery({ ...answers, priorityCategories: [] });
    expect(query).toContain("everyday spending");
  });
});

describe("searchCardsForBucket (D15)", () => {
  beforeEach(() => {
    searchGroundedTextMock.mockReset();
    extractStructuredJsonMock.mockReset();
  });

  it("returns [] when the grounded search yields no citations (nothing to attribute to)", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "some text", citations: [] });
    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toEqual([]);
    expect(extractStructuredJsonMock).not.toHaveBeenCalled();
  });

  it("drops a card whose sourceUrls don't match any real citation (fabricated URL)", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawCard({ sourceUrls: ["https://made-up.example/not-a-real-source"] }),
    ]);

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toEqual([]);
  });

  it("keeps a card with a real citation and narrows sourceUrls to only the attributed ones", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawCard({
        sourceUrls: ["https://bank-a.example/card-a", "https://made-up.example/fake"],
      }),
    ]);

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toHaveLength(1);
    expect(result[0]!.sourceUrls).toEqual(["https://bank-a.example/card-a"]);
  });

  it("drops one malformed card without discarding the rest of the batch", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawCard({ name: "Good Card" }),
      { name: "Bad Card" }, // missing required fields
    ]);

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Good Card");
  });

  it("dedupes cards sharing the same issuer+name", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawCard({ name: "Same Card", issuer: "SameBank" }),
      makeRawCard({ name: "same card", issuer: "samebank" }),
    ]);

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toHaveLength(1);
  });

  it(`caps the result at ${MAX_SEARCH_CARDS} cards`, async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => makeRawCard({ name: `Card ${i}`, issuer: `Bank ${i}` }))
    );

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toHaveLength(MAX_SEARCH_CARDS);
  });

  it("returns [] when extraction doesn't produce an array", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue({ not: "an array" });

    const result = await searchCardsForBucket(answers, "test-key");
    expect(result).toEqual([]);
  });

  it("propagates a hard failure from the grounded search (caller decides fallback, mirrors D7)", async () => {
    searchGroundedTextMock.mockRejectedValue(new Error("network error"));
    await expect(searchCardsForBucket(answers, "test-key")).rejects.toThrow("network error");
  });
});
