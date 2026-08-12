import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  profile: null as { answers: unknown } | null,
  recommendations: [] as { rank: number; cardId: string; explanation: string }[],
};

vi.mock("@perq/db", () => ({
  userProfile: { userId: "userId" },
  recommendations: { userId: "userId", rank: "rank" },
  db: {
    select: vi.fn(() => ({
      from: (table: { userId?: string; rank?: string }) => ({
        where: () => {
          // Distinguish the two tables by an object identity check against
          // the imported mock table shapes.
          if ("rank" in table) {
            const query = {
              orderBy: () => Promise.resolve(dbState.recommendations),
            };
            return query;
          }
          return {
            limit: () => Promise.resolve(dbState.profile ? [dbState.profile] : []),
          };
        },
      }),
    })),
  },
}));

const { buildGroundingContext } = await import("@/lib/mimir/chatContext");

describe("buildGroundingContext (D2/D11)", () => {
  beforeEach(() => {
    dbState.profile = null;
    dbState.recommendations = [];
  });

  it("returns null when the user has no profile yet", async () => {
    const result = await buildGroundingContext("user-1");
    expect(result).toBeNull();
  });

  it("includes the raw quiz answers in the context", async () => {
    dbState.profile = { answers: { fuelSpend: "6k+" } };
    const result = await buildGroundingContext("user-1");
    expect(result).toContain("fuelSpend");
    expect(result).toContain("6k+");
  });

  it("includes ranked recommendations with rank number and explanation", async () => {
    dbState.profile = { answers: {} };
    dbState.recommendations = [
      { rank: 1, cardId: "card-a", explanation: "Great for dining" },
      { rank: 2, cardId: "card-b", explanation: "Good for fuel" },
    ];
    const result = await buildGroundingContext("user-1");
    expect(result).toContain("#1 card-a: Great for dining");
    expect(result).toContain("#2 card-b: Good for fuel");
  });

  it("handles a profile with no recommendations yet without throwing", async () => {
    dbState.profile = { answers: {} };
    dbState.recommendations = [];
    const result = await buildGroundingContext("user-1");
    expect(result).toContain("(none yet)");
  });
});
