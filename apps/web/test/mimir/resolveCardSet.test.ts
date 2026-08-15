import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QuizAnswers } from "@perq/scoring-engine";

const dbState = {
  bucketCards: [] as { id: string; sourceUpdatedAt: Date }[],
  fallbackCards: [] as unknown[],
  insertedRows: [] as unknown[],
  updateCalls: 0,
  selectCallCount: 0,
};

vi.mock("@perq/db", () => {
  const cardsTable = { origin: "origin", searchBucketKey: "searchBucketKey", status: "status" };
  return {
    cards: cardsTable,
    db: {
      select: vi.fn(() => {
        dbState.selectCallCount++;
        const callIndex = dbState.selectCallCount;
        return {
          from: () => ({
            where: () =>
              Promise.resolve(callIndex === 1 ? dbState.bucketCards : dbState.fallbackCards),
          }),
        };
      }),
      update: vi.fn(() => {
        dbState.updateCalls++;
        return { set: () => ({ where: () => Promise.resolve() }) };
      }),
      insert: vi.fn(() => ({
        values: (rows: Record<string, unknown>[]) => {
          dbState.insertedRows = rows;
          return {
            returning: () =>
              Promise.resolve(rows.map((r, i) => ({ id: `new-card-${i}`, ...r }))),
          };
        },
      })),
    },
  };
});

const searchCardsForBucketMock = vi.fn();
vi.mock("@/lib/mimir/cardSearch", () => ({
  searchCardsForBucket: (...args: unknown[]) => searchCardsForBucketMock(...args),
  MIN_VALID_SEARCH_CARDS: 5,
}));

const { resolveCardSet, SEARCH_CACHE_TTL_MS } = await import("@/lib/mimir/resolveCardSet");

const answers: QuizAnswers = {
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

function makeValidResults(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Card ${i}`,
    issuer: `Bank ${i}`,
    network: "Visa" as const,
    joiningFee: 500,
    annualFee: 500,
    rewardRates: { dining: 0.02 },
    milestoneBenefits: [],
    sourceUrls: [`https://bank-${i}.example/card`],
  }));
}

describe("resolveCardSet (D15)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    dbState.bucketCards = [];
    dbState.fallbackCards = [];
    dbState.insertedRows = [];
    dbState.updateCalls = 0;
    dbState.selectCallCount = 0;
    searchCardsForBucketMock.mockReset();
  });

  it("reuses a fresh bucket cache without calling search or touching the DB", async () => {
    dbState.bucketCards = [{ id: "card-1", sourceUpdatedAt: new Date() }];

    const result = await resolveCardSet(answers);

    expect(searchCardsForBucketMock).not.toHaveBeenCalled();
    expect(dbState.updateCalls).toBe(0);
    expect(result.cardSourceMode).toBe("web_search");
    expect(result.activeCards).toEqual(dbState.bucketCards);
  });

  it("treats a bucket older than the TTL as a cache miss and re-searches", async () => {
    dbState.bucketCards = [
      { id: "card-1", sourceUpdatedAt: new Date(Date.now() - SEARCH_CACHE_TTL_MS - 1000) },
    ];
    searchCardsForBucketMock.mockResolvedValue(makeValidResults(6));

    const result = await resolveCardSet(answers);

    expect(searchCardsForBucketMock).toHaveBeenCalledOnce();
    expect(result.cardSourceMode).toBe("web_search");
  });

  it("triggers a search on a cache miss and persists results tagged origin='web_search'", async () => {
    searchCardsForBucketMock.mockResolvedValue(makeValidResults(6));

    const result = await resolveCardSet(answers);

    expect(dbState.updateCalls).toBe(1); // discontinues any old bucket rows first
    expect(dbState.insertedRows).toHaveLength(6);
    expect(
      (dbState.insertedRows as { origin: string; searchBucketKey: string }[]).every(
        (r) => r.origin === "web_search" && r.searchBucketKey
      )
    ).toBe(true);
    expect(result.cardSourceMode).toBe("web_search");
    expect(result.activeCards).toHaveLength(6);
  });

  it("falls back to the seeded DB set when the search throws", async () => {
    searchCardsForBucketMock.mockRejectedValue(new Error("network error"));
    dbState.fallbackCards = [{ id: "seeded-card" }];
    const onNarrationStep = vi.fn();

    const result = await resolveCardSet(answers, onNarrationStep);

    expect(result.cardSourceMode).toBe("db_fallback");
    expect(result.activeCards).toEqual(dbState.fallbackCards);
    expect(onNarrationStep).toHaveBeenCalledWith("MIMIR is using its trusted card list");
  });

  it("falls back to the seeded DB set when search returns too few valid cards", async () => {
    searchCardsForBucketMock.mockResolvedValue(makeValidResults(3)); // below MIN_VALID_SEARCH_CARDS
    dbState.fallbackCards = [{ id: "seeded-card" }];

    const result = await resolveCardSet(answers);

    expect(result.cardSourceMode).toBe("db_fallback");
    expect(dbState.insertedRows).toEqual([]);
  });

  it("falls back to the seeded DB set immediately when no GEMINI_API_KEY is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    dbState.fallbackCards = [{ id: "seeded-card" }];

    const result = await resolveCardSet(answers);

    expect(searchCardsForBucketMock).not.toHaveBeenCalled();
    expect(result.cardSourceMode).toBe("db_fallback");
  });
});
