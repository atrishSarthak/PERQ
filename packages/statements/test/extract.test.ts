import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtractedStatement } from "@perq/shared";
import { mergeChunkTransactions, parseStatementPdf, type StatementLlm } from "../src";

const dir = resolve(__dirname, "../fixtures/synthetic");
const load = (n: string) => ({
  pdf: new Uint8Array(readFileSync(`${dir}/${n}.pdf`)),
  ...(JSON.parse(readFileSync(`${dir}/${n}.json`, "utf-8")) as { password: string; expected: ExtractedStatement }),
});

describe("parseStatementPdf", () => {
  it("accepts a reconciling deterministic read without calling the LLM", async () => {
    const { pdf, password } = load("B-sbi-2026-10-22");
    const llm = vi.fn();
    const steps: string[] = [];
    const r = await parseStatementPdf(pdf, password, { llm, onStep: (s) => steps.push(s) });
    expect(r).toMatchObject({ model: "heuristic", attempts: 1 });
    expect(r.reconcile.reconciled).toBe(true);
    expect(llm).not.toHaveBeenCalled();
    expect(steps).toEqual(["Unlocked your statement", "Read 26 transactions"]);
  });

  it("uses the LLM (mocked) when forced, and accepts its reconciling answer", async () => {
    const { pdf, password, expected } = load("A-hdfc-2026-10-15");
    const llm: StatementLlm = vi.fn(async () => expected);
    const r = await parseStatementPdf(pdf, password, { llm, forceLlm: true });
    expect(r).toMatchObject({ model: "gemini", attempts: 1 });
    expect(r.reconcile.reconciled).toBe(true);
    expect(r.extracted.totalDue).toBe(expected.totalDue);
  });

  it("retries once naming the failing figures, then keeps the better reading", async () => {
    const { pdf, password, expected } = load("A-hdfc-2026-10-15");
    const wrong = { ...expected, transactions: expected.transactions.slice(2) };
    const llm = vi.fn<StatementLlm>().mockResolvedValueOnce(wrong).mockResolvedValueOnce(expected);
    const r = await parseStatementPdf(pdf, password, { llm, forceLlm: true });
    expect(r.attempts).toBe(2);
    expect(r.reconcile.reconciled).toBe(true);
    expect(llm.mock.calls[1]![0]).toMatch(/did not add up[\s\S]*Debit lines sum to/);
  });

  it("returns an unreconciled result (never claims it reconciles) when the LLM stays wrong", async () => {
    const { pdf, password, expected } = load("A-hdfc-2026-10-15");
    const wrong = { ...expected, totalDue: expected.totalDue! + 1000 };
    const r = await parseStatementPdf(pdf, password, { llm: vi.fn(async () => wrong), forceLlm: true });
    expect(r.reconcile.reconciled).toBe(false);
    expect(r.reconcile.issues.length).toBeGreaterThan(0);
  });

  it("splits long statements and drops only adjacent page-break duplicates", () => {
    const t = (d: string, a: number) => ({ date: d, description: "X", amount: a, direction: "debit" as const });
    expect(mergeChunkTransactions([[t("2026-10-01", 5), t("2026-10-02", 9)], [t("2026-10-02", 9), t("2026-10-03", 1)]])).toHaveLength(3);
    // Same line twice inside one chunk = two real purchases: kept.
    expect(mergeChunkTransactions([[t("2026-10-02", 9), t("2026-10-02", 9)]])).toHaveLength(2);
  });
});
