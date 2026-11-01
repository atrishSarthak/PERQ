// pnpm eval:statements: field-level accuracy of statement extraction (handoff §14)
// on the SYNTHETIC fixtures only. Runs the heuristic parser and real Gemini
// (forced, so the LLM path is measured even when the heuristic would win).
// Targets: ≥ 98% on summary fields, ≥ 95% on transactions.
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractStructuredJson, type ResponseSchema } from "@perq/ai";
import type { ExtractedStatement } from "@perq/shared";
import { parseStatementPdf, type StatementLlm } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") });
const DIR = resolve(here, "../fixtures/synthetic");

const SUMMARY = ["issuer", "cardName", "last4", "statementDate", "periodStart", "periodEnd", "dueDate", "totalDue", "minimumDue", "previousBalance", "paymentsCredits", "purchasesDebits", "feesCharges", "financeCharges", "creditLimit", "availableLimit"] as const;
const POINTS = ["opening", "earned", "redeemed", "closing", "expiring", "expiryDate"] as const;

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : v);
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.01;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return norm(a) === norm(b);
}

function score(expected: ExtractedStatement, got: ExtractedStatement) {
  const misses: string[] = [];
  let ok = 0;
  let total = 0;
  for (const k of SUMMARY) {
    total++;
    if (same(expected[k], got[k])) ok++;
    else misses.push(`${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(got[k])}`);
  }
  if (expected.points) {
    for (const k of POINTS) {
      total++;
      if (same(expected.points[k], got.points?.[k])) ok++;
      else misses.push(`points.${k}: expected ${JSON.stringify(expected.points[k])}, got ${JSON.stringify(got.points?.[k])}`);
    }
  }
  // Transactions: a match is same date, amount (±₹0.01) and direction, each used once.
  const pool = [...got.transactions];
  let matched = 0;
  for (const e of expected.transactions) {
    const i = pool.findIndex((g) => g.date === e.date && Math.abs(g.amount - e.amount) <= 0.01 && g.direction === e.direction);
    if (i >= 0) {
      matched++;
      pool.splice(i, 1);
    } else misses.push(`missing txn ${e.date} ${e.amount} ${e.direction}`);
  }
  pool.forEach((g) => misses.push(`extra txn ${g.date} ${g.amount} ${g.direction}`));
  const txnDenom = Math.max(expected.transactions.length, got.transactions.length);
  return { summaryOk: ok, summaryTotal: total, txnOk: matched, txnTotal: txnDenom, misses };
}

async function main() {
  const key = process.env.GEMINI_API_KEY;
  const llm: StatementLlm | null = key && process.env.GEMINI_DISABLED !== "1" ? (p, s) => extractStructuredJson(key, p, s as ResponseSchema) : null;
  const rows: string[] = [];
  const totals = { heuristic: [0, 0, 0, 0], gemini: [0, 0, 0, 0] } as Record<string, number[]>;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(resolve(DIR, f), "utf-8")) as { password: string; layout: string; expected: ExtractedStatement };
    const pdf = new Uint8Array(readFileSync(resolve(DIR, f.replace(/\.json$/, ".pdf"))));
    for (const mode of ["heuristic", "gemini"] as const) {
      if (mode === "gemini" && !llm) {
        rows.push(`| ${f.replace(".json", "")} | gemini | skipped (no GEMINI_API_KEY) | | | |`);
        continue;
      }
      const started = Date.now();
      try {
        const r = await parseStatementPdf(pdf.slice(), fx.password, mode === "gemini" ? { llm: llm!, forceLlm: true } : {});
        const s = score(fx.expected, r.extracted);
        const t = totals[mode]!;
        t[0]! += s.summaryOk; t[1]! += s.summaryTotal; t[2]! += s.txnOk; t[3]! += s.txnTotal;
        rows.push(`| ${f.replace(".json", "")} | ${mode} | ${s.summaryOk}/${s.summaryTotal} | ${s.txnOk}/${s.txnTotal} | ${r.reconcile.reconciled ? "yes" : "no"} | ${((Date.now() - started) / 1000).toFixed(1)}s |`);
        if (s.misses.length) console.error(`${f} ${mode}:\n  ${s.misses.slice(0, 12).join("\n  ")}`);
      } catch (err) {
        rows.push(`| ${f.replace(".json", "")} | ${mode} | error: ${(err as Error).message.slice(0, 60)} | | | |`);
      }
    }
  }
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "n/a");
  console.log("| Fixture | Path | Summary fields | Transactions | Reconciled | Time |\n|---|---|---|---|---|---|");
  rows.forEach((r) => console.log(r));
  console.log("");
  let pass = true;
  for (const [mode, [so, st, to, tt]] of Object.entries(totals)) {
    if (!st) continue;
    const ok = so! / st! >= 0.98 && to! / tt! >= 0.95;
    pass &&= ok;
    console.log(`**${mode}**: summary ${pct(so!, st!)} (target ≥ 98%), transactions ${pct(to!, tt!)} (target ≥ 95%): ${ok ? "PASS" : "FAIL"}`);
  }
  process.exit(pass ? 0 : 1);
}

main();
