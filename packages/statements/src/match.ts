// Matching a parsed statement to a catalogue card and the user's card
// accounts (handoff §5.6). Pure; the review screen always shows the match
// and lets the user change it.

export interface CatalogueEntry {
  id: string;
  name: string;
  issuer: string;
}
export interface AccountEntry {
  id: string;
  issuer: string;
  last4: string;
  cardId: string | null;
  cardLabel: string;
}

export interface CardMatch {
  /** Existing account with the same issuer + last4 (re-upload / next month). */
  accountId: string | null;
  /** Best catalogue card, if confident. */
  catalogueCardId: string | null;
  confidence: number; // 0..1
  /** Top candidates for the "change card" picker. */
  candidates: { id: string; name: string; issuer: string; score: number }[];
}

const STOP = new Set(["BANK", "CREDIT", "CARD", "THE", "LTD", "LIMITED", "OF", "INDIA", "PLATINUM"]);

export function tokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Issuer families: "SBI Card" = "State Bank of India", "HDFC Bank" = "HDFC". */
export function issuerKey(issuer: string): string {
  const s = issuer.toUpperCase();
  if (/\bSBI\b|STATE BANK/.test(s)) return "SBI";
  if (/HDFC/.test(s)) return "HDFC";
  if (/ICICI/.test(s)) return "ICICI";
  if (/AXIS/.test(s)) return "AXIS";
  if (/KOTAK/.test(s)) return "KOTAK";
  if (/IDFC/.test(s)) return "IDFC";
  if (/HSBC/.test(s)) return "HSBC";
  if (/AMERICAN EXPRESS|AMEX/.test(s)) return "AMEX";
  if (/\bAU\b/.test(s)) return "AU";
  if (/YES/.test(s)) return "YES";
  if (/FEDERAL/.test(s)) return "FEDERAL";
  return tokens(s)[0] ?? s;
}

/** Share of the printed name's distinctive words found in the catalogue name. */
function nameScore(printed: string, candidate: string): number {
  const p = tokens(printed);
  const c = new Set(tokens(candidate));
  if (!p.length) return 0;
  return p.filter((w) => c.has(w)).length / p.length;
}

export const MATCH_THRESHOLD = 0.6;

export function matchCard(
  parsed: { issuer: string | null; cardName: string | null; last4: string | null },
  catalogue: CatalogueEntry[],
  accounts: AccountEntry[]
): CardMatch {
  const key = parsed.issuer ? issuerKey(parsed.issuer) : null;
  const account =
    parsed.last4 && key ? accounts.find((a) => a.last4 === parsed.last4 && issuerKey(a.issuer) === key) ?? null : null;

  const sameIssuer = key ? catalogue.filter((c) => issuerKey(c.issuer) === key) : catalogue;
  const scored = sameIssuer
    .map((c) => ({ id: c.id, name: c.name, issuer: c.issuer, score: parsed.cardName ? nameScore(parsed.cardName, c.name) : 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // An existing account already linked to a catalogue card wins.
  if (account?.cardId) {
    return { accountId: account.id, catalogueCardId: account.cardId, confidence: 1, candidates: scored.slice(0, 5) };
  }
  const best = scored[0];
  const confident = !!best && best.score >= MATCH_THRESHOLD && (scored[1]?.score ?? 0) < best.score;
  return {
    accountId: account?.id ?? null,
    catalogueCardId: confident ? best.id : null,
    confidence: best?.score ?? 0,
    candidates: scored.slice(0, 5),
  };
}

/** Day of month (1–31) from an ISO date. */
export const dayOf = (iso: string | null) => (iso ? Number(iso.slice(8, 10)) : null);

/** Month (1–12) of an annual-fee line, to set the fee anniversary (§5.6). */
export function feeAnniversaryMonth(transactions: { date: string; description: string; direction: string }[]): number | null {
  const fee = transactions.find((t) => t.direction === "debit" && /ANNUAL FEE|RENEWAL FEE|MEMBERSHIP FEE/i.test(t.description));
  return fee ? Number(fee.date.slice(5, 7)) : null;
}
