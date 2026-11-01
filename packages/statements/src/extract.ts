import { reconcile, type ReconcileResult } from "@perq/finance-engine";
import { extractedStatementSchema, type ExtractedStatement, type ExtractedTransaction } from "@perq/shared";
import { heuristicExtract } from "./heuristic";
import { extractPdfLines, linesToText, type PdfLine } from "./pdfText";

// Statement parsing orchestration (handoff §5.1–5.4), all in memory.
//   1. decrypt + extract text
//   2. deterministic read; if it reconciles, done (no LLM call)
//   3. otherwise Gemini structured extraction (chunked for long statements)
//   4. reconcile; on failure retry once naming the failing figures
// The LLM is injected so tests mock it and the server passes Gemini.

export const PARSER_VERSION = "2026-11-01.1";

/** Returns the JSON object the model produced for a prompt. */
export type StatementLlm = (prompt: string, schema: object) => Promise<unknown>;

export interface ParseOptions {
  llm?: StatementLlm | null;
  onStep?: (label: string) => void;
  /** Force the LLM path even if the heuristic reconciles (eval only). */
  forceLlm?: boolean;
}

export interface ParsedStatement {
  extracted: ExtractedStatement;
  reconcile: ReconcileResult;
  model: "heuristic" | "gemini";
  attempts: number;
}

// Gemini structured-output schema (SDK-agnostic shape, see packages/ai ResponseSchema).
const str = { type: "string", nullable: true };
const num = { type: "number", nullable: true };
const TXN_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string" },
    description: { type: "string" },
    amount: { type: "number" },
    direction: { type: "string" },
  },
  required: ["date", "description", "amount", "direction"],
};
export const STATEMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    issuer: str, cardName: str, last4: str, statementDate: str, periodStart: str, periodEnd: str, dueDate: str,
    totalDue: num, minimumDue: num, previousBalance: num, paymentsCredits: num, purchasesDebits: num,
    feesCharges: num, financeCharges: num, creditLimit: num, availableLimit: num,
    points: {
      type: "object",
      nullable: true,
      properties: { opening: num, earned: num, redeemed: num, closing: num, expiring: num, expiryDate: str },
    },
    transactions: { type: "array", items: TXN_SCHEMA },
  },
  required: ["transactions"],
};
const TXN_ONLY_SCHEMA = { type: "object", properties: { transactions: { type: "array", items: TXN_SCHEMA } }, required: ["transactions"] };

const RULES = `Rules:
- Copy every number exactly as printed. Do not compute, round or correct anything.
- Dates as ISO YYYY-MM-DD.
- Amounts as positive numbers; put "debit" or "credit" in direction ("Cr", a Credit column, payments, refunds and cashback are credits).
- Use null for any field that isn't printed. Never guess.
- Include EVERY transaction line: purchases, payments, refunds, cashback, fees, GST/IGST, interest/finance charges, EMI lines.
- last4 is the last 4 digits of the card number only.`;

export function extractionPrompt(text: string, issues?: string[]): string {
  return [
    "Extract this Indian credit card statement into the JSON schema.",
    RULES,
    issues?.length
      ? `A previous reading did not add up. Re-read carefully and fix it:\n- ${issues.join("\n- ")}`
      : "",
    "Statement text:",
    text,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const CHUNK_CHARS = 18_000;

/** Pages grouped into prompt-sized chunks (whole pages only). */
export function chunkPages(lines: PdfLine[]): PdfLine[][] {
  const byPage = new Map<number, PdfLine[]>();
  for (const l of lines) byPage.set(l.page, [...(byPage.get(l.page) ?? []), l]);
  const chunks: PdfLine[][] = [];
  let cur: PdfLine[] = [];
  for (const page of byPage.values()) {
    const size = linesToText([...cur, ...page]).length;
    if (cur.length && size > CHUNK_CHARS) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(...page);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Merge per-chunk transaction lists. A line is dropped as a page-break
 * duplicate only when date, description and amount all match AND it is the
 * last line of one chunk and the first line of the next (§5.3).
 */
export function mergeChunkTransactions(chunks: ExtractedTransaction[][]): ExtractedTransaction[] {
  const same = (a?: ExtractedTransaction, b?: ExtractedTransaction) =>
    !!a && !!b && a.date === b.date && a.description === b.description && a.amount === b.amount && a.direction === b.direction;
  const out: ExtractedTransaction[] = [];
  chunks.forEach((c, i) => {
    const prev = chunks[i - 1];
    const skipFirst = i > 0 && same(prev?.[prev.length - 1], c[0]);
    out.push(...(skipFirst ? c.slice(1) : c));
  });
  return out;
}

function coerce(raw: unknown): ExtractedStatement | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== "object") return null;
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, "")) || null);
  const fixed = {
    ...r,
    last4: typeof r.last4 === "string" ? (r.last4.match(/\d{4}$/)?.[0] ?? null) : null,
    points: r.points ?? null,
    transactions: ((r.transactions as ExtractedTransaction[]) ?? []).map((t) => ({
      ...t,
      amount: Math.abs(n(t.amount) ?? 0),
      direction: String(t.direction).toLowerCase().startsWith("c") ? "credit" : "debit",
    })),
  };
  for (const k of ["totalDue", "minimumDue", "previousBalance", "paymentsCredits", "purchasesDebits", "feesCharges", "financeCharges", "creditLimit", "availableLimit"]) {
    (fixed as Record<string, unknown>)[k] = n(r[k]);
  }
  const parsed = extractedStatementSchema.safeParse(fixed);
  return parsed.success ? parsed.data : null;
}

async function llmExtract(lines: PdfLine[], llm: StatementLlm, issues?: string[]): Promise<ExtractedStatement | null> {
  const chunks = chunkPages(lines);
  if (chunks.length === 1) return coerce(await llm(extractionPrompt(linesToText(lines), issues), STATEMENT_RESPONSE_SCHEMA));

  // Long statement: header fields once (first + last chunk, where summary and
  // points usually sit), then transactions chunk by chunk.
  const headerText = linesToText([...chunks[0]!, ...chunks[chunks.length - 1]!]);
  const header = coerce(await llm(extractionPrompt(headerText, issues), STATEMENT_RESPONSE_SCHEMA));
  if (!header) return null;
  const parts: ExtractedTransaction[][] = [];
  for (const c of chunks) {
    const raw = (await llm(`${extractionPrompt(linesToText(c), issues)}\n\nReturn ONLY the transactions on these pages.`, TXN_ONLY_SCHEMA)) as {
      transactions?: unknown[];
    };
    parts.push(coerce({ transactions: raw?.transactions ?? [] })?.transactions ?? []);
  }
  return { ...header, transactions: mergeChunkTransactions(parts) };
}

/** Parse a statement PDF. Throws StatementPdfError for password/format problems. */
export async function parseStatementPdf(bytes: Uint8Array, password: string | undefined, opts: ParseOptions = {}): Promise<ParsedStatement> {
  const lines = await extractPdfLines(bytes, password);
  opts.onStep?.("Unlocked your statement");

  if (!opts.forceLlm) {
    const h = heuristicExtract(lines);
    const r = reconcile(h);
    if (r.reconciled || !opts.llm) {
      opts.onStep?.(`Read ${h.transactions.length} transactions`);
      return { extracted: h, reconcile: r, model: "heuristic", attempts: 1 };
    }
  }

  const llm = opts.llm!;
  let extracted = await llmExtract(lines, llm);
  if (!extracted) throw new Error("extraction_failed");
  opts.onStep?.(`Read ${extracted.transactions.length} transactions`);
  let r = reconcile(extracted);
  let attempts = 1;
  if (!r.reconciled) {
    // §5.4: retry once, naming the figures that failed.
    const retry = await llmExtract(lines, llm, r.issues);
    attempts = 2;
    if (retry) {
      const r2 = reconcile(retry);
      if (r2.reconciled || Math.abs(r2.summary.diff ?? Infinity) < Math.abs(r.summary.diff ?? Infinity)) {
        extracted = retry;
        r = r2;
      }
    }
  }
  return { extracted, reconcile: r, model: "gemini", attempts };
}
