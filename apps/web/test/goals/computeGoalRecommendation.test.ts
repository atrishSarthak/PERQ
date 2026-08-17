import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  profileRows: [] as unknown[],
  arsenalRows: [] as unknown[],
  goalUpdates: [] as unknown[],
  insertedGoalRec: null as unknown,
};

const goalsTable = Symbol("goals");
const userProfileTable = Symbol("userProfile");
const userCardArsenalTable = Symbol("userCardArsenal");
const cardsTable = Symbol("cards");
const goalRecommendationsTable = Symbol("goalRecommendations");

vi.mock("@perq/db", () => ({
  goals: goalsTable,
  userProfile: userProfileTable,
  userCardArsenal: userCardArsenalTable,
  cards: cardsTable,
  goalRecommendations: goalRecommendationsTable,
  db: {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === userProfileTable) {
          return { where: () => ({ limit: () => Promise.resolve(dbState.profileRows) }) };
        }
        if (table === userCardArsenalTable) {
          return {
            innerJoin: () => ({
              where: () => Promise.resolve(dbState.arsenalRows),
            }),
          };
        }
        return { where: () => ({ limit: () => Promise.resolve([]) }) };
      },
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        dbState.goalUpdates.push(values);
        return { where: () => Promise.resolve() };
      },
    })),
    insert: vi.fn(() => ({
      values: (row: unknown) => ({
        returning: () => {
          dbState.insertedGoalRec = row;
          return Promise.resolve([{ id: "grec-1" }]);
        },
      }),
    })),
  },
}));

const understandGoalMock = vi.fn();
vi.mock("@/lib/goals/understandGoal", () => ({
  understandGoal: (...args: unknown[]) => understandGoalMock(...args),
}));

const discoverPurchaseOptionsMock = vi.fn();
vi.mock("@/lib/goals/discoverPurchaseOptions", () => ({
  discoverPurchaseOptions: (...args: unknown[]) => discoverPurchaseOptionsMock(...args),
}));

const refinePricesMock = vi.fn();
vi.mock("@/lib/goals/precisionFetch", () => ({
  refinePricesWithPrecisionFetch: (...args: unknown[]) => refinePricesMock(...args),
}));

const runGeminiAgentMock = vi.fn();
vi.mock("@perq/ai", () => ({
  runGeminiAgent: (...args: unknown[]) => runGeminiAgentMock(...args),
  createGeminiModelCaller: () => vi.fn(),
}));

const { computeAndPersistGoalRecommendation } = await import(
  "@/lib/goals/computeGoalRecommendation"
);

const OK_UNDERSTANDING = {
  ok: true,
  category: "ecommerce",
  facts: { summary: "iPhone 15", subject: "iPhone 15", location: null, variant: null, budgetHint: null },
};

const ONE_OFFER = {
  offers: [
    { title: "iPhone 15", price: 57749, sourceUrl: "https://flipkart.com/x", sourceLabel: "Flipkart" },
  ],
  cardOfferNote: null,
  cardOfferCitationUrl: null,
};

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  dbState.profileRows = [];
  dbState.arsenalRows = [];
  dbState.goalUpdates = [];
  dbState.insertedGoalRec = null;
  understandGoalMock.mockReset();
  discoverPurchaseOptionsMock.mockReset();
  refinePricesMock.mockImplementation((offers: unknown[]) => Promise.resolve(offers));
  runGeminiAgentMock.mockReset();
});

describe("computeAndPersistGoalRecommendation", () => {
  it("returns unsupported and updates goals.category without any discovery call", async () => {
    understandGoalMock.mockResolvedValue({ ok: false, reason: "unsupported" });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "what's the weather", []);

    expect(result).toEqual({ outcome: "unsupported" });
    expect(dbState.goalUpdates).toEqual([{ category: "unsupported" }]);
    expect(discoverPurchaseOptionsMock).not.toHaveBeenCalled();
  });

  it("returns needs_clarification without touching goals.category or discovery", async () => {
    understandGoalMock.mockResolvedValue({
      ok: false,
      reason: "needs_clarification",
      question: "Which city?",
    });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy concert tickets", []);

    expect(result).toEqual({ outcome: "needs_clarification", question: "Which city?" });
    expect(dbState.goalUpdates).toEqual([]);
    expect(discoverPurchaseOptionsMock).not.toHaveBeenCalled();
  });

  it("returns total_failure when discovery hard-fails, with no goal_recommendations row written", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockRejectedValue(new Error("Gemini API failure"));

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(result.outcome).toBe("total_failure");
    expect(dbState.insertedGoalRec).toBeNull();
  });

  it("returns no_listings_found when discovery finds nothing, distinct from total_failure", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockResolvedValue({
      offers: [],
      cardOfferNote: null,
      cardOfferCitationUrl: null,
    });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(result.outcome).toBe("no_listings_found");
    expect(dbState.insertedGoalRec).toBeNull();
  });

  it("returns no_listings_found when every offer's price stays unconfirmed after precision fetch", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockResolvedValue(ONE_OFFER);
    refinePricesMock.mockResolvedValue([{ ...ONE_OFFER.offers[0], price: null }]);

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(result.outcome).toBe("no_listings_found");
    if (result.outcome === "no_listings_found") {
      expect(result.offersChecked).toEqual([
        { source: "Flipkart", sourceUrl: "https://flipkart.com/x", outcome: "unconfirmed_price" },
      ]);
    }
  });

  it("succeeds end to end and persists the winning offer", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockResolvedValue(ONE_OFFER);
    runGeminiAgentMock.mockResolvedValue({
      finalText: "MIMIR recommends Flipkart for this one.",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(result.outcome).toBe("success");
    expect(dbState.insertedGoalRec).toMatchObject({
      goalId: "g1",
      userId: "u1",
      recommendedChannel: "Flipkart",
      explanation: "MIMIR recommends Flipkart for this one.",
    });
  });

  it("falls back to a grounded template explanation when the narration call fails", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockResolvedValue(ONE_OFFER);
    runGeminiAgentMock.mockRejectedValue(new Error("quota exhausted"));

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(result.outcome).toBe("success");
    const inserted = dbState.insertedGoalRec as { explanation: string };
    expect(inserted.explanation).toContain("MIMIR recommends buying from");
  });

  it("carries a citation-backed card offer note through to the persisted row", async () => {
    understandGoalMock.mockResolvedValue(OK_UNDERSTANDING);
    discoverPurchaseOptionsMock.mockResolvedValue({
      ...ONE_OFFER,
      cardOfferNote: "10% instant discount with HDFC cards.",
      cardOfferCitationUrl: "https://flipkart.com/offers",
    });
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Go with Flipkart.",
      roundsUsed: 1,
      cappedOut: false,
    });

    await computeAndPersistGoalRecommendation("u1", "g1", "buy an iPhone 15", []);

    expect(dbState.insertedGoalRec).toMatchObject({
      cardOfferNote: "10% instant discount with HDFC cards.",
      cardOfferCitationUrl: "https://flipkart.com/offers",
    });
  });

  it("passes the accumulated clarification transcript through to understandGoal", async () => {
    understandGoalMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    const transcript = [{ question: "Which city?", answer: "Bangalore" }];

    await computeAndPersistGoalRecommendation("u1", "g1", "buy tickets", transcript);

    expect(understandGoalMock).toHaveBeenCalledWith("buy tickets", transcript, expect.any(String));
  });
});
