import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reconcile } from "@perq/finance-engine";
import { heuristicExtract, parseAmount, parseDate } from "../src/heuristic";
import { extractPdfLines } from "../src/pdfText";

const dir = resolve(__dirname, "../fixtures/synthetic");
const FIXTURES = ["A-hdfc-2026-10-15", "B-sbi-2026-10-22", "C-axis-2026-10-05"];

describe("heuristic parser helpers", () => {
  it("parses Indian date formats", () => {
    expect(parseDate("15/10/2026")).toBe("2026-10-15");
    expect(parseDate("22 Oct 2026")).toBe("2026-10-22");
    expect(parseDate("05-Oct-26")).toBe("2026-10-05");
    expect(parseDate("not a date")).toBeNull();
  });
  it("parses Indian-grouped amounts", () => {
    expect(parseAmount("Rs. 1,50,000.00")).toBe(150000);
    expect(parseAmount("29,350.74 Cr")).toBe(29350.74);
  });
});

describe("heuristic extraction on the synthetic layouts", () => {
  for (const name of FIXTURES) {
    it(`${name}: matches the expected JSON and reconciles`, async () => {
      const { password, expected } = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf-8"));
      const got = heuristicExtract(await extractPdfLines(new Uint8Array(readFileSync(`${dir}/${name}.pdf`)), password));
      expect(reconcile(got).reconciled).toBe(true);
      for (const k of ["statementDate", "periodStart", "periodEnd", "dueDate", "totalDue", "minimumDue", "previousBalance", "paymentsCredits", "purchasesDebits", "feesCharges", "financeCharges", "creditLimit", "availableLimit", "last4", "cardName"]) {
        expect([k, got[k as keyof typeof got]]).toEqual([k, expected[k]]);
      }
      expect(got.transactions).toHaveLength(expected.transactions.length);
      const key = (t: { date: string; amount: number; direction: string }) => `${t.date}|${t.amount}|${t.direction}`;
      expect(got.transactions.map(key).sort()).toEqual(expected.transactions.map(key).sort());
      if (expected.points) expect(got.points).toEqual(expected.points);
    });
  }
});
