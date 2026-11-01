import type { ExtractedStatement, ExtractedTransaction } from "@perq/shared";
import type { PdfLine } from "./pdfText";

// Deterministic statement reader. It handles the common Indian layouts
// (labelled summary block, date-led transaction rows, "Cr"/"Dr" suffixes or
// separate Debit/Credit columns). Its output is only trusted if it
// reconciles; otherwise the orchestrator falls back to Gemini (DECISIONS).

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const DATE_RE = /(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]{3})[A-Za-z]*[\/\-. ,]+(\d{2,4})/;
const AMOUNT_RE = /(?<![\d.])(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|\d+\.\d{1,2}|\d{1,3}(?:,\d{2,3})+|\d+)(?![\d,])/;

/** "15/10/2026", "15-10-26", "22 Oct 2026", "22-Oct-2026" → ISO, or null. */
export function parseDate(s: string): string | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const d = m[1]!.padStart(2, "0");
  const mon = /^\d+$/.test(m[2]!) ? m[2]!.padStart(2, "0") : MONTHS[m[2]!.slice(0, 3).toLowerCase()];
  if (!mon || Number(mon) > 12 || Number(d) > 31) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${mon}-${d}`;
}

export function parseAmount(s: string): number | null {
  const m = s.match(AMOUNT_RE);
  return m ? Number(m[1]!.replace(/,/g, "")) : null;
}

/** First amount printed after a label on the same line. */
function amountAfter(text: string, label: RegExp): number | null {
  const m = label.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const a = rest.match(/^[\s:=\-–Rs.₹INR]*?((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)/i);
  return a ? Number(a[1]!.replace(/,/g, "")) : null;
}

function dateAfter(text: string, label: RegExp): string | null {
  const m = label.exec(text);
  return m ? parseDate(text.slice(m.index + m[0].length, m.index + m[0].length + 30)) : null;
}

const L = {
  totalDue: /total\s+(?:amount\s+due|dues?|payment\s+due)/i,
  minimumDue: /minimum\s+(?:amount\s+|payment\s+)?due/i,
  previousBalance: /(?:previous|opening)\s+balance/i,
  paymentsCredits: /payments?\s*(?:[\/&]|and)?\s*(?:other\s+)?credits?|(?<![a-z])payments(?=\s+[\d,]+\.\d)/i,
  purchasesDebits: /purchases?\s*(?:[\/&]|and)?\s*(?:other\s+)?debits?|(?<![a-z])purchases(?=\s+[\d,]+\.\d)/i,
  feesCharges: /fees?,?\s*(?:taxes\s*)?(?:&|and)?\s*charges|(?<![a-z])fees(?=\s+[\d,]+\.\d)/i,
  financeCharges: /finance\s+charges?/i,
  creditLimit: /(?<!available\s)(?<!available\scredit\s)(?:total\s+)?credit\s+limit/i,
  availableLimit: /available\s+(?:credit\s+)?limit/i,
  statementDate: /statement\s+(?:generation\s+)?date/i,
  dueDate: /payment\s+due\s+date|(?<!payment\s)due\s+date/i,
  period: /statement\s+period|for\s+the\s+period/i,
};

const CREDIT_WORDS = /PAYMENT RECEIVED|THANK YOU|REFUND|CASHBACK|REVERSAL|NEFT PAYMENT|IMPS PAYMENT|BBPS PAYMENT/i;

export function heuristicExtract(lines: PdfLine[]): ExtractedStatement {
  const texts = lines.map((l) => l.text);
  const first = <T>(fn: (t: string) => T | null): T | null => {
    for (const t of texts) {
      const v = fn(t);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };

  // Transactions: rows that start with a date, end with an amount.
  const header = lines.find((l) => /\bdebit\b/i.test(l.text) && /\bcredit\b/i.test(l.text) && /date/i.test(l.text));
  const debitX = header?.segments.find((s) => /^debit/i.test(s.text))?.xEnd;
  const creditX = header?.segments.find((s) => /^credit/i.test(s.text))?.xEnd;
  const firstTxnPage = header?.page ?? 1;

  const txns: ExtractedTransaction[] = [];
  for (const l of lines) {
    if (l.page < firstTxnPage) continue;
    const t = l.text;
    const dm = t.match(new RegExp(`^${DATE_RE.source}`));
    if (!dm) continue;
    const date = parseDate(dm[0]);
    if (!date) continue;
    const amountSeg = [...l.segments].reverse().find((s) => /^\d[\d,]*\.\d{2}(\s*(cr|dr))?$/i.test(s.text.trim()));
    if (!amountSeg) continue;
    const amount = parseAmount(amountSeg.text);
    if (amount === null) continue;
    const description = t
      .slice(dm[0].length)
      .replace(amountSeg.text, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!description || /^(to|-)\s*\d/.test(description)) continue; // "15/09/2026 To 15/10/2026" etc.

    let direction: "debit" | "credit";
    if (/\bcr$/i.test(amountSeg.text.trim())) direction = "credit";
    else if (/\bdr$/i.test(amountSeg.text.trim())) direction = "debit";
    else if (debitX !== undefined && creditX !== undefined) {
      direction = Math.abs(amountSeg.xEnd - creditX) < Math.abs(amountSeg.xEnd - debitX) ? "credit" : "debit";
    } else direction = CREDIT_WORDS.test(description) ? "credit" : "debit";

    txns.push({ date, description, amount, direction });
  }

  const periodText = first((t) => (L.period.test(t) ? t.slice(L.period.exec(t)!.index) : null));
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (periodText) {
    const dates = [...periodText.matchAll(new RegExp(DATE_RE.source, "g"))].map((m) => parseDate(m[0]));
    periodStart = dates[0] ?? null;
    periodEnd = dates[1] ?? null;
  }

  const issuerLine = texts[0] ?? "";
  const last4 = first((t) => t.match(/(?:x{4}|\*{4})[\sx*]*(\d{4})\b/i)?.[1] ?? null);
  const cardName = first((t) => {
    // "Millennia Credit Card Statement", or a "Card: NAME" field, which in
    // two-column layouts shares a line with the left column.
    const m = t.match(/^(.*?)\s+credit card statement/i) ?? t.match(/(?:^|\s{2})card:\s*(.+?)(?:\s{2,}|$)/i);
    return m ? m[1]!.trim() : null;
  }) ?? texts.slice(0, 6).find((t) => /^[A-Za-z0-9 &+.]+\bcredit card$/i.test(t.trim()))?.trim() ?? null;

  const pointsLine = texts.find((t) => /opening balance:\s*\d/i.test(t) && /earned/i.test(t));
  const expLine = texts.find((t) => /points expiring/i.test(t));
  const points = pointsLine
    ? {
        opening: amountAfter(pointsLine, /opening balance/i),
        earned: amountAfter(pointsLine, /earned/i),
        redeemed: amountAfter(pointsLine, /redeemed/i),
        closing: amountAfter(pointsLine, /closing balance/i),
        expiring: expLine ? amountAfter(expLine, /points expiring:?/i) : null,
        expiryDate: expLine ? parseDate(expLine.replace(/^.*?\bon\b/i, "")) : null,
      }
    : null;

  const summaryLines = texts.filter((t) => !new RegExp(`^${DATE_RE.source}`).test(t));
  const fromSummary = (re: RegExp) => {
    for (const t of summaryLines) {
      const v = amountAfter(t, re);
      if (v !== null) return v;
    }
    return null;
  };

  return {
    issuer: issuerLine ? titleCase(issuerLine) : null,
    cardName,
    last4,
    statementDate: first((t) => dateAfter(t, L.statementDate)) ?? periodEnd,
    periodStart,
    periodEnd,
    dueDate: first((t) => dateAfter(t, L.dueDate)),
    totalDue: fromSummary(L.totalDue),
    minimumDue: fromSummary(L.minimumDue),
    previousBalance: fromSummary(L.previousBalance),
    paymentsCredits: fromSummary(L.paymentsCredits),
    purchasesDebits: fromSummary(L.purchasesDebits),
    feesCharges: fromSummary(L.feesCharges),
    financeCharges: fromSummary(L.financeCharges),
    creditLimit: fromSummary(L.creditLimit),
    availableLimit: fromSummary(L.availableLimit),
    points,
    transactions: txns,
  };
}

function titleCase(s: string): string {
  const known: Record<string, string> = { "HDFC BANK": "HDFC Bank", "SBI CARD": "SBI Card", "AXIS BANK": "Axis Bank", "ICICI BANK": "ICICI Bank" };
  const k = s.trim().toUpperCase();
  return known[k] ?? s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
