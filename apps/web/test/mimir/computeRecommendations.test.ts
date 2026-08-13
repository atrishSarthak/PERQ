import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QuizAnswers } from "@perq/scoring-engine";

const dbState = {
  cachedTop: null as { explanation: string; cardId: string } | null,
  deleteCalls: 0,
  insertedRows: [] as unknown[],
  profileUpdates: [] as unknown[],
};

vi.mock("@perq/db", () => {
  const recommendationsTable = {
    userId: "userId",
    profileHash: "profileHash",
    cardsVersion: "cardsVersion",
    rank: "rank",
  };
  const userProfileTable = { userId: "userId" };

  function makeSelectChain(result: unknown[]) {
    return {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(result),
        }),
      }),
    };
  }

  return {
    recommendations: recommendationsTable,
    userProfile: userProfileTable,
    db: {
      // The only remaining direct db.select() call in this module's own
      // path is D6's cache lookup — card sourcing now goes entirely through
      // the mocked resolveCardSet below.
      select: vi.fn(() => makeSelectChain(dbState.cachedTop ? [dbState.cachedTop] : [])),
      delete: vi.fn(() => {
        dbState.deleteCalls++;
        return { where: () => Promise.resolve() };
      }),
      insert: vi.fn(() => ({
        values: (rows: unknown[]) => {
          dbState.insertedRows = rows;
          return Promise.resolve();
        },
      })),
      update: vi.fn(() => ({
        set: (values: unknown) => {
          dbState.profileUpdates.push(values);
          return { where: () => Promise.resolve() };
        },
      })),
    },
  };
});

const runGeminiAgentMock = vi.fn();
vi.mock("@perq/ai", () => ({
  runGeminiAgent: (...args: unknown[]) => runGeminiAgentMock(...args),
  createGeminiModelCaller: vi.fn(() => vi.fn()),
}));

const resolveCardSetMock = vi.fn();
vi.mock("@/lib/mimir/resolveCardSet", () => ({
  resolveCardSet: (...args: unknown[]) => resolveCardSetMock(...args),
}));

const { computeAndPersistRecommendations } = await import(
  "@/lib/mimir/computeRecommendations"
);

function makeDbCard(id: string, dining: number) {
  return {
    id,
    name: `Card ${id}`,
    issuer: "TestBank",
    network: "Visa",
    annualFee: "0",
    joiningFee: "0",
    feeWaiverCondition: null,
    rewardRates: { dining },
    milestoneBenefits: [],
    welcomeBonus: null,
    loungeAccess: null,
    forexMarkupPct: "0",
    redemptionValue: "0",
    minIncomeEligibility: null,
    coBrandPartner: null,
    status: "active",
    sourceUpdatedAt: new Date("2026-01-01"),
  };
}

const answers: QuizAnswers = {
  heldCardIds: [],
  annualIncome: "6-12l",
  flightFrequency: "never",
  hotelFrequency: "never",
  gymMembership: { active: false, monthlyCost: null },
  foodDeliverySpend: "3-6k",
  ecommerceSpend: "<1k",
  grocerySpend: "<1k",
  diningOutSpend: "3-6k",
  fuelSpend: "<1k",
  recurringBillsByCard: false,
  feeTolerant: true,
  priorityCategories: [],
};

describe("computeAndPersistRecommendations — previousTopCard guard (§9.5)", () => {
  beforeEach(() => {
    // createGeminiModelCaller is mocked (@perq/ai), but requireGeminiKey()
    // reads process.env directly before ever calling it — only the two
    // "Gemini actually gets called" tests need this set.
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    dbState.cachedTop = null;
    dbState.deleteCalls = 0;
    dbState.insertedRows = [];
    dbState.profileUpdates = [];
    runGeminiAgentMock.mockReset();
    resolveCardSetMock.mockReset();
    resolveCardSetMock.mockResolvedValue({
      activeCards: [makeDbCard("card-a", 0.05)],
      cardSourceMode: "db_fallback",
      searchBucketKey: "bucket-key-1",
    });
  });

  it("skips Gemini entirely when the #1 card is unchanged, reusing the prior explanation verbatim", async () => {
    const result = await computeAndPersistRecommendations(
      "user-1",
      answers,
      undefined,
      { cardId: "card-a", explanation: "Prior explanation text", explanationSource: "gemini" }
    );

    expect(runGeminiAgentMock).not.toHaveBeenCalled();
    expect(result.topCardChanged).toBe(false);
    expect(result.explanationSource).toBe("gemini");
    const topRow = (dbState.insertedRows as { rank: number; explanation: string }[]).find(
      (r) => r.rank === 1
    );
    expect(topRow?.explanation).toBe("Prior explanation text");
  });

  it("preserves a prior fallback_template source rather than relabeling it gemini when unchanged", async () => {
    await computeAndPersistRecommendations("user-1", answers, undefined, {
      cardId: "card-a",
      explanation: "Fallback text",
      explanationSource: "fallback_template",
    });

    const topRow = (
      dbState.insertedRows as { rank: number; explanationSource: string }[]
    ).find((r) => r.rank === 1);
    expect(topRow?.explanationSource).toBe("fallback_template");
  });

  it("calls Gemini when the #1 card changes relative to previousTopCard", async () => {
    runGeminiAgentMock.mockResolvedValue({
      finalText: "New explanation",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistRecommendations(
      "user-1",
      answers,
      undefined,
      { cardId: "some-other-card", explanation: "Old explanation", explanationSource: "gemini" }
    );

    expect(runGeminiAgentMock).toHaveBeenCalledOnce();
    expect(result.topCardChanged).toBe(true);
    expect(result.explanationSource).toBe("gemini");
  });

  it("D7: falls back to the template explanation when runGeminiAgent throws (429/network error), rather than crashing the whole request", async () => {
    runGeminiAgentMock.mockRejectedValue(new Error("got status: 429 Too Many Requests"));

    const result = await computeAndPersistRecommendations("user-1", answers);

    expect(result.explanationSource).toBe("fallback_template");
    expect(result.recommendationCount).toBeGreaterThan(0);
    const topRow = (
      dbState.insertedRows as { rank: number; explanation: string; explanationSource: string }[]
    ).find((r) => r.rank === 1);
    expect(topRow?.explanationSource).toBe("fallback_template");
    expect(topRow?.explanation).toContain("MIMIR recommends");
  });

  it("calls Gemini on a fresh quiz-submit with no previousTopCard at all", async () => {
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Fresh explanation",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistRecommendations("user-1", answers);

    expect(runGeminiAgentMock).toHaveBeenCalledOnce();
    expect(result.topCardChanged).toBe(true);
  });

  it("reuses the D6 cache instead of calling Gemini when the top card changed but was seen before", async () => {
    dbState.cachedTop = { cardId: "card-a", explanation: "Cached explanation" };

    const result = await computeAndPersistRecommendations(
      "user-1",
      answers,
      undefined,
      { cardId: "different-card", explanation: "irrelevant", explanationSource: "gemini" }
    );

    expect(runGeminiAgentMock).not.toHaveBeenCalled();
    expect(result.explanationSource).toBe("gemini");
  });

  it("deletes and replaces recommendations exactly once (D14), never accumulating", async () => {
    await computeAndPersistRecommendations("user-1", answers, undefined, {
      cardId: "card-a",
      explanation: "Prior explanation text",
      explanationSource: "gemini",
    });
    expect(dbState.deleteCalls).toBe(1);
  });
});

describe("computeAndPersistRecommendations — D15 card sourcing", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    dbState.cachedTop = null;
    dbState.deleteCalls = 0;
    dbState.insertedRows = [];
    dbState.profileUpdates = [];
    runGeminiAgentMock.mockReset();
    resolveCardSetMock.mockReset();
  });

  it("stamps cardSourceMode from resolveCardSet onto every inserted recommendation row and the result", async () => {
    resolveCardSetMock.mockResolvedValue({
      activeCards: [makeDbCard("card-a", 0.05)],
      cardSourceMode: "web_search",
      searchBucketKey: "bucket-key-1",
    });
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Explanation",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistRecommendations("user-1", answers);

    expect(result.cardSourceMode).toBe("web_search");
    expect(
      (dbState.insertedRows as { cardSourceMode: string }[]).every(
        (r) => r.cardSourceMode === "web_search"
      )
    ).toBe(true);
  });

  it("persists lastCardSourceMode/lastSearchBucketKey onto userProfile after resolving the card set", async () => {
    resolveCardSetMock.mockResolvedValue({
      activeCards: [makeDbCard("card-a", 0.05)],
      cardSourceMode: "web_search",
      searchBucketKey: "bucket-key-1",
    });
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Explanation",
      roundsUsed: 1,
      cappedOut: false,
    });

    await computeAndPersistRecommendations("user-1", answers);

    expect(dbState.profileUpdates).toContainEqual({
      lastCardSourceMode: "web_search",
      lastSearchBucketKey: "bucket-key-1",
    });
  });

  it("clears lastSearchBucketKey when the DB fallback was used, even though a bucket key was computed", async () => {
    resolveCardSetMock.mockResolvedValue({
      activeCards: [makeDbCard("card-a", 0.05)],
      cardSourceMode: "db_fallback",
      searchBucketKey: "bucket-key-1",
    });
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Explanation",
      roundsUsed: 1,
      cappedOut: false,
    });

    await computeAndPersistRecommendations("user-1", answers);

    expect(dbState.profileUpdates).toContainEqual({
      lastCardSourceMode: "db_fallback",
      lastSearchBucketKey: null,
    });
  });
});
