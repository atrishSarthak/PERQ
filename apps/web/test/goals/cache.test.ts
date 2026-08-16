import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  selectResult: [] as unknown[],
  upsertCalls: [] as unknown[],
};

vi.mock("@perq/db", () => ({
  channelFetchCache: {
    channel: "channel",
    queryKey: "queryKey",
  },
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(dbState.selectResult),
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (row: unknown) => ({
        onConflictDoUpdate: (opts: { set: unknown }) => {
          dbState.upsertCalls.push({ row, set: opts.set });
          return Promise.resolve();
        },
      }),
    })),
  },
}));

const { findFreshCacheEntry, upsertCacheEntry } = await import("@/lib/goals/cache");

beforeEach(() => {
  dbState.selectResult = [];
  dbState.upsertCalls = [];
});

describe("findFreshCacheEntry", () => {
  it("returns null on a cache miss", async () => {
    dbState.selectResult = [];
    expect(await findFreshCacheEntry("amazon", "electronics:iphone")).toBeNull();
  });

  it("returns the cached entry when fresh", async () => {
    dbState.selectResult = [
      {
        expiresAt: new Date(Date.now() + 60_000),
        outcome: "succeeded",
        extractedData: { found: true, price: 1000, title: "iPhone 15" },
      },
    ];
    const result = await findFreshCacheEntry("amazon", "electronics:iphone");
    expect(result).toEqual({
      outcome: "succeeded",
      data: { found: true, price: 1000, title: "iPhone 15" },
    });
  });

  it("returns null (miss) for an expired row", async () => {
    dbState.selectResult = [
      {
        expiresAt: new Date(Date.now() - 1000),
        outcome: "succeeded",
        extractedData: { found: true, price: 1000, title: "iPhone 15" },
      },
    ];
    expect(await findFreshCacheEntry("amazon", "electronics:iphone")).toBeNull();
  });

  it("returns null (miss) rather than throwing on a shape that fails re-validation", async () => {
    dbState.selectResult = [
      {
        expiresAt: new Date(Date.now() + 60_000),
        outcome: "succeeded",
        extractedData: { found: true /* missing required price/title */ },
      },
    ];
    expect(await findFreshCacheEntry("amazon", "electronics:iphone")).toBeNull();
  });
});

describe("upsertCacheEntry", () => {
  it("writes via onConflictDoUpdate keyed on (channel, query_key)", async () => {
    await upsertCacheEntry("amazon", "electronics:iphone", "electronics", "succeeded", {
      found: true,
      price: 1000,
      title: "iPhone 15",
    });

    expect(dbState.upsertCalls).toHaveLength(1);
    const call = dbState.upsertCalls[0] as { row: { channel: string; queryKey: string } };
    expect(call.row.channel).toBe("amazon");
    expect(call.row.queryKey).toBe("electronics:iphone");
  });
});
