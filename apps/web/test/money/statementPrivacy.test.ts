// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { parseStatementPdf } from "@perq/statements";
import { signDraft } from "@/lib/money/parseToken";

// Locked rule (§2, §16): the statement PDF and its password live only in
// memory for one request. Never on disk, in the DB, in storage or in logs.

const ROOT = resolve(__dirname, "../../../..");
const INGESTION = [
  "apps/web/app/api/statements",
  "apps/web/lib/money/statementService.ts",
  "apps/web/lib/money/parseToken.ts",
  "apps/web/lib/money/passwordAttempts.ts",
  "packages/statements/src",
];

function files(p: string): string[] {
  const abs = join(ROOT, p);
  return statSync(abs).isDirectory() ? readdirSync(abs).flatMap((f) => files(join(p, f))) : [abs];
}

describe("statement PDF and password stay in memory", () => {
  it("nothing in the ingestion path writes files or temp dirs", () => {
    const offenders = INGESTION.flatMap(files)
      .filter((f) => /\.tsx?$/.test(f) && !/synthetic\.ts$/.test(f)) // the generator only builds fake PDFs in memory too
      .filter((f) => /\b(writeFile|writeFileSync|appendFile|createWriteStream|mkdtemp|tmpdir|put\(|upload\()/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("no log line in the ingestion path mentions the password or file", () => {
    const logs = INGESTION.flatMap(files)
      .filter((f) => /\.tsx?$/.test(f))
      .flatMap((f) => readFileSync(f, "utf-8").split("\n").filter((l) => /console\.(log|info|warn|error|debug)/.test(l)));
    for (const l of logs) expect(l).not.toMatch(/password|fileBase64|pdf\b|bytes/i);
  });

  it("the review token carries the extracted draft only, never the PDF or password", async () => {
    process.env.PARSE_TOKEN_SECRET = "x".repeat(40);
    const token = await signDraft("u1", {
      model: "heuristic",
      summary: { issuer: "HDFC Bank", cardName: null, last4: "4821", statementDate: "2026-10-15", periodStart: null, periodEnd: null, dueDate: null, totalDue: 100, minimumDue: null, previousBalance: null, paymentsCredits: null, purchasesDebits: null, feesCharges: null, financeCharges: null, creditLimit: null, availableLimit: null, points: null },
      transactions: [],
      reconcile: { reconciled: true, summaryOk: true, linesOk: true, diff: 0, issues: [] },
      match: { accountId: null, accountLabel: null, catalogueCardId: null, catalogueCardName: null, confidence: 0, candidates: [] },
    } as never);
    const claims = JSON.stringify(decodeJwt(token));
    expect(claims).not.toMatch(/password|fileBase64|%PDF/i);
  });

  it("a real parse never prints the password", async () => {
    const dir = join(ROOT, "packages/statements/fixtures/synthetic");
    const fx = JSON.parse(readFileSync(join(dir, "A-hdfc-2026-10-15.json"), "utf-8")) as { password: string };
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await parseStatementPdf(new Uint8Array(readFileSync(join(dir, "A-hdfc-2026-10-15.pdf"))), fx.password, {});
    await parseStatementPdf(new Uint8Array(readFileSync(join(dir, "A-hdfc-2026-10-15.pdf"))), "WRONG123", {}).catch(() => {});
    const printed = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    spies.forEach((s) => s.mockRestore());
    expect(printed).not.toContain(fx.password);
    expect(printed).not.toContain("WRONG123");
  });
});
