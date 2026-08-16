import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  cacheRows: [] as unknown[],
  profileRows: [] as unknown[],
  arsenalRows: [] as unknown[],
  goalUpdates: [] as unknown[],
  cacheUpserts: [] as unknown[],
  insertedGoalRec: null as unknown,
};

const goalsTable = Symbol("goals");
const userProfileTable = Symbol("userProfile");
const userCardArsenalTable = Symbol("userCardArsenal");
const cardsTable = Symbol("cards");
const channelFetchCacheTable = Symbol("channelFetchCache");
const goalRecommendationsTable = Symbol("goalRecommendations");

vi.mock("@perq/db", () => ({
  goals: goalsTable,
  userProfile: userProfileTable,
  userCardArsenal: userCardArsenalTable,
  cards: cardsTable,
  channelFetchCache: channelFetchCacheTable,
  goalRecommendations: goalRecommendationsTable,
  db: {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === channelFetchCacheTable) {
          return { where: () => ({ limit: () => Promise.resolve(dbState.cacheRows) }) };
        }
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
    insert: vi.fn((table: unknown) => {
      if (table === channelFetchCacheTable) {
        return {
          values: (row: unknown) => ({
            onConflictDoUpdate: () => {
              dbState.cacheUpserts.push(row);
              return Promise.resolve();
            },
          }),
        };
      }
      return {
        values: (row: unknown) => ({
          returning: () => {
            dbState.insertedGoalRec = row;
            return Promise.resolve([{ id: "grec-1" }]);
          },
        }),
      };
    }),
  },
}));

const fetchPageMock = vi.fn();
vi.mock("@perq/fetch", () => ({ fetchPage: (...args: unknown[]) => fetchPageMock(...args) }));

const extractStructuredJsonMock = vi.fn();
const runGeminiAgentMock = vi.fn();
vi.mock("@perq/ai", () => ({
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
  runGeminiAgent: (...args: unknown[]) => runGeminiAgentMock(...args),
  createGeminiModelCaller: () => vi.fn(),
}));

const { computeAndPersistGoalRecommendation } = await import(
  "@/lib/goals/computeGoalRecommendation"
);

function mockClassification(raw: unknown) {
  extractStructuredJsonMock.mockImplementation((_key: string, prompt: string) => {
    if (prompt.includes("Classify it into exactly one")) return Promise.resolve(raw);
    return Promise.resolve({ found: false });
  });
}

function mockExtraction(byChannelContent: (markdown: string) => unknown) {
  extractStructuredJsonMock.mockImplementation((_key: string, prompt: string) => {
    if (prompt.includes("Classify it into exactly one")) {
      return Promise.resolve({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
    }
    return Promise.resolve(byChannelContent(prompt));
  });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
  dbState.cacheRows = [];
  dbState.profileRows = [];
  dbState.arsenalRows = [];
  dbState.goalUpdates = [];
  dbState.cacheUpserts = [];
  dbState.insertedGoalRec = null;
  fetchPageMock.mockReset();
  extractStructuredJsonMock.mockReset();
  runGeminiAgentMock.mockReset();
});

describe("computeAndPersistGoalRecommendation", () => {
  it("returns unsupported and updates goals.category without any channel fetch", async () => {
    mockClassification({ category: "unsupported" });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "help me buy groceries");

    expect(result).toEqual({ outcome: "unsupported" });
    expect(dbState.goalUpdates).toEqual([{ category: "unsupported" }]);
    expect(fetchPageMock).not.toHaveBeenCalled();
  });

  it("returns missing_info without any channel fetch", async () => {
    mockClassification({ category: "movie", movieName: "Oppenheimer", city: null });

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "book a movie ticket");

    expect(result).toEqual({ outcome: "missing_info", missingField: "city" });
    expect(fetchPageMock).not.toHaveBeenCalled();
  });

  it("returns total_failure when both channels fail to fetch, with no goal_recommendations row written", async () => {
    mockClassification({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
    fetchPageMock.mockResolvedValue({ success: false, error: "blocked", transient: false });

    const result = await computeAndPersistGoalRecommendation(
      "u1",
      "g1",
      "watch Oppenheimer in Bangalore"
    );

    expect(result.outcome).toBe("total_failure");
    expect(dbState.insertedGoalRec).toBeNull();
  });

  it("returns no_listings_found when channels are checked but nothing matches, distinct from total_failure", async () => {
    mockExtraction(() => ({ found: false }));
    fetchPageMock.mockResolvedValue({ success: true, markdown: "no results here" });

    const result = await computeAndPersistGoalRecommendation(
      "u1",
      "g1",
      "watch Oppenheimer in Bangalore"
    );

    expect(result.outcome).toBe("no_listings_found");
    expect(dbState.insertedGoalRec).toBeNull();
  });

  it("succeeds end to end via the movie two-hop fetch (T0): listing -> detail URL -> price", async () => {
    mockClassification({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
    // hop 1 (listing): finds the matching movie's detail URL.
    // hop 2 (detail page): extracts the real price.
    extractStructuredJsonMock.mockImplementation((_key: string, prompt: string) => {
      if (prompt.includes("Classify it into exactly one")) {
        return Promise.resolve({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
      }
      if (prompt.includes("Find the specific movie")) {
        return Promise.resolve({
          found: true,
          detailUrl: "https://in.bookmyshow.com/movies/oppenheimer-MV999",
          title: "Oppenheimer",
        });
      }
      return Promise.resolve({ found: true, price: 300, title: "Oppenheimer 7pm" });
    });
    fetchPageMock.mockImplementation((url: string) =>
      Promise.resolve({ success: true, markdown: `content for ${url}` })
    );
    runGeminiAgentMock.mockResolvedValue({
      finalText: "MIMIR recommends BookMyShow for Oppenheimer.",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistGoalRecommendation(
      "u1",
      "g1",
      "watch Oppenheimer in Bangalore"
    );

    expect(result.outcome).toBe("success");
    // 2 channels x 2 hops each = 4 fetchPage calls, including the
    // detail-page URL the listing hop extracted.
    expect(fetchPageMock).toHaveBeenCalledTimes(4);
    expect(fetchPageMock).toHaveBeenCalledWith(
      "https://in.bookmyshow.com/movies/oppenheimer-MV999",
      expect.anything()
    );
    expect(dbState.insertedGoalRec).toMatchObject({
      goalId: "g1",
      userId: "u1",
      explanation: "MIMIR recommends BookMyShow for Oppenheimer.",
    });
  });

  it("treats a movie listing hop that finds no matching movie as no_listings_found, never attempting a detail fetch", async () => {
    mockClassification({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
    extractStructuredJsonMock.mockImplementation((_key: string, prompt: string) => {
      if (prompt.includes("Classify it into exactly one")) {
        return Promise.resolve({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
      }
      return Promise.resolve({ found: false }); // hop 1: not in this city's listing
    });
    fetchPageMock.mockResolvedValue({ success: true, markdown: "listing with no match" });

    const result = await computeAndPersistGoalRecommendation(
      "u1",
      "g1",
      "watch Oppenheimer in Bangalore"
    );

    expect(result.outcome).toBe("no_listings_found");
    // Only the 2 listing fetches (hop 1) — no detail-page fetch (hop 2)
    // for either channel since neither listing matched.
    expect(fetchPageMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to a grounded template explanation when the narration call fails (electronics, single-hop)", async () => {
    mockClassification({ category: "electronics", productName: "iPhone 15" });
    extractStructuredJsonMock.mockImplementation((_key: string, prompt: string) => {
      if (prompt.includes("Classify it into exactly one")) {
        return Promise.resolve({ category: "electronics", productName: "iPhone 15" });
      }
      return Promise.resolve({ found: true, price: 57749, title: "iPhone 15" });
    });
    fetchPageMock.mockResolvedValue({ success: true, markdown: "content" });
    runGeminiAgentMock.mockRejectedValue(new Error("quota exhausted"));

    const result = await computeAndPersistGoalRecommendation("u1", "g1", "cheapest iPhone 15");

    expect(result.outcome).toBe("success");
    const inserted = dbState.insertedGoalRec as { explanation: string };
    expect(inserted.explanation).toContain("MIMIR recommends buying on");
  });

  it("skips fetchPage entirely on a fresh cache hit for both channels", async () => {
    mockClassification({ category: "movie", movieName: "Oppenheimer", city: "Bangalore" });
    dbState.cacheRows = [
      {
        expiresAt: new Date(Date.now() + 60_000),
        outcome: "succeeded",
        extractedData: { found: true, price: 300, title: "Oppenheimer 7pm" },
      },
    ];
    runGeminiAgentMock.mockResolvedValue({
      finalText: "Go with BookMyShow.",
      roundsUsed: 1,
      cappedOut: false,
    });

    const result = await computeAndPersistGoalRecommendation(
      "u1",
      "g1",
      "watch Oppenheimer in Bangalore"
    );

    expect(result.outcome).toBe("success");
    expect(fetchPageMock).not.toHaveBeenCalled();
  });
});
