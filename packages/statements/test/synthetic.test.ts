import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractedStatementSchema } from "@perq/shared";
import { buildSyntheticStatement, FIXTURE_SPECS, renderSyntheticPdf } from "../src";

describe("synthetic statement generator", () => {
  for (const spec of FIXTURE_SPECS) {
    const { expected: e } = buildSyntheticStatement(spec);

    it(`layout ${spec.layout}: matches the shared extraction schema`, () => {
      expect(extractedStatementSchema.safeParse(e).success).toBe(true);
    });

    it(`layout ${spec.layout}: reconciles by construction`, () => {
      const expectedTotal = e.previousBalance! - e.paymentsCredits! + e.purchasesDebits! + e.feesCharges! + e.financeCharges!;
      expect(Math.abs(expectedTotal - e.totalDue!)).toBeLessThan(0.01);
      const debits = e.transactions.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
      const credits = e.transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
      expect(Math.abs(debits - (e.purchasesDebits! + e.feesCharges! + e.financeCharges!))).toBeLessThan(0.05);
      expect(Math.abs(credits - e.paymentsCredits!)).toBeLessThan(0.05);
    });

    it(`layout ${spec.layout}: is deterministic for a seed`, () => {
      expect(buildSyntheticStatement(spec).expected).toEqual(e);
    });
  }

  it("covers fees, GST, interest, a refund, a payment, cashback, UPI and international lines", () => {
    const all = FIXTURE_SPECS.flatMap((s) => buildSyntheticStatement(s).expected.transactions.map((t) => t.description));
    for (const pattern of [/LATE PAYMENT FEE/, /IGST/, /FINANCE CHARGES/, /REFUND/, /PAYMENT RECEIVED/, /CASHBACK/, /^UPI-/, /SINGAPORE|STOCKHOLM/]) {
      expect(all.some((d) => pattern.test(d))).toBe(true);
    }
  });

  it("renders an encrypted PDF", async () => {
    const pdf = await renderSyntheticPdf(buildSyntheticStatement(FIXTURE_SPECS[0]!));
    const head = Buffer.from(pdf).toString("latin1");
    expect(head.startsWith("%PDF-1.7")).toBe(true);
    expect(head).toContain("/Encrypt");
  });

  it("committed fixtures are synthetic and match their expected JSON", () => {
    const dir = resolve(__dirname, "../fixtures/synthetic");
    const jsons = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(jsons).toHaveLength(3);
    for (const f of jsons) {
      const { expected } = JSON.parse(readFileSync(`${dir}/${f}`, "utf-8"));
      const spec = FIXTURE_SPECS.find((s) => s.statementDate === expected.statementDate)!;
      expect(buildSyntheticStatement(spec).expected).toEqual(expected);
    }
  });
});
