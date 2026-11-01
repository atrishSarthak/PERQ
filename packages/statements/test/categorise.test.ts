import { describe, expect, it, vi } from "vitest";
import type { TxnCategory } from "@perq/finance-engine";
import { categoriseTransactions } from "../src";

const txns = [
  { date: "2026-10-01", description: "SWIGGY*ORDER", amount: 400, direction: "debit" as const },
  { date: "2026-10-02", description: "BLUE TOKAI COFFEE", amount: 300, direction: "debit" as const },
  { date: "2026-10-03", description: "MYSTERY MART 22", amount: 900, direction: "debit" as const },
  { date: "2026-10-04", description: "ODD WIDGETS CO", amount: 150, direction: "debit" as const },
];

describe("categoriseTransactions", () => {
  it("sends only unknown merchant names to the AI and caches only AI answers", async () => {
    const saveSharedCache = vi.fn(async (_m: Map<string, TxnCategory>) => {});
    const llm = vi.fn(async () => ({ results: [{ merchant: "MYSTERY MART", category: "groceries" }, { merchant: "ODD WIDGETS", category: "nonsense" }] }));
    const out = await categoriseTransactions(txns, {
      sharedCacheFor: async () => new Map(),
      // The user once moved Blue Tokai to "groceries".
      userOverrides: async () => new Map([["BLUE TOKAI COFFEE", "groceries" as TxnCategory]]),
      saveSharedCache,
      llm,
    });
    const prompt = (llm.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain("MYSTERY MART");
    expect(prompt).not.toMatch(/900|BLUE TOKAI|2026/); // names only, no amounts/dates/known merchants
    expect(out.map((t) => [t.category, t.categorySource])).toEqual([
      ["food_delivery", "rule"],
      ["groceries", "user"],
      ["groceries", "ai"],
      ["other", "rule"], // invalid AI category ignored
    ]);
    // The user's override never reaches the shared cache.
    const saved = saveSharedCache.mock.calls[0]![0];
    expect([...saved.keys()]).toEqual(["MYSTERY MART"]);
  });

  it("works without the AI (unknowns become other) and survives an AI failure", async () => {
    const io = { sharedCacheFor: async () => new Map(), userOverrides: async () => new Map(), saveSharedCache: vi.fn(async () => {}) };
    expect((await categoriseTransactions(txns, io))[2]!.category).toBe("other");
    const failing = await categoriseTransactions(txns, { ...io, llm: vi.fn(async () => { throw new Error("429"); }) });
    expect(failing[2]!.category).toBe("other");
  });
});
