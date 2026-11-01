import type { OfferSpec } from "@perq/shared";

// Offers (§5.2). Matching is conservative: an offer applies to a card only
// when the bank (and the network or card name, when the offer states one)
// can be confirmed from the card's catalogue entry or account.

const BANKS: [RegExp, string][] = [
  [/\bhdfc\b/, "hdfc"],
  [/\bsbi\b|state bank/, "sbi"],
  [/\baxis\b/, "axis"],
  [/\bicici\b/, "icici"],
  [/\bkotak\b/, "kotak"],
  [/\bidfc\b/, "idfc"],
  [/\bhsbc\b/, "hsbc"],
  [/\byes\b/, "yes"],
  [/\bau\b|au small/, "au"],
  [/\bfederal\b/, "federal"],
  [/\bamex\b|american express/, "amex"],
  [/\brbl\b/, "rbl"],
  [/\bindusind\b/, "indusind"],
  [/\bbob\b|bank of baroda|\bbobcard\b/, "bob"],
  [/\bcsb\b/, "csb"],
  [/\bstandard chartered\b|\bsc\b/, "sc"],
  [/\bonecard\b/, "onecard"],
];

/** A bank's key from loose text ("HDFC Bank", "SBI Cards", "Axis bank credit cards"). */
export function bankKey(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(/[^a-z ]/g, " ");
  for (const [re, key] of BANKS) if (re.test(s)) return key;
  const rest = s.replace(/\b(bank|banks|card|cards|credit|debit|ltd|limited|the)\b/g, " ").trim().replace(/\s+/g, " ");
  return rest || null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface OfferCard {
  issuer: string;
  label: string;
  /** Catalogue name and networks; null when the account isn't linked to the catalogue. */
  name: string | null;
  networks: string[] | null;
}

export interface OfferOutcome {
  eligible: boolean;
  discount: number; // ₹, integer, rounded down
  reason: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Does this offer apply to paying with `card` (null = UPI / debit), and for
 * how much? `emi` = the purchase is converted to EMI.
 */
export function applyOffer(offer: OfferSpec, card: OfferCard | null, price: number, opts: { emi?: boolean } = {}): OfferOutcome {
  const no = (reason: string): OfferOutcome => ({ eligible: false, discount: 0, reason });
  if (offer.type === "no_cost_emi") return no("Counted in the EMI cost, not as a discount");
  if (offer.emiOnly && !opts.emi) return no("Only when you pay by EMI");
  if (offer.minOrder !== undefined && price < offer.minOrder) return no(`Needs an order of at least ${inr(offer.minOrder)}`);

  const restricted = !!offer.bank || !!offer.network || !!offer.cardNames?.length;
  if (restricted) {
    if (!card) return no(offer.bank ? `Only on ${offer.bank} cards` : "Only on certain cards");
    if (offer.bank) {
      const want = bankKey(offer.bank);
      if (!want || want !== bankKey(card.issuer)) return no(`Only on ${offer.bank} cards`);
    }
    if (offer.network) {
      // A card sold on several networks could be either: we can't confirm which one the user holds.
      if (!card.networks || card.networks.length !== 1) return no("Couldn't confirm this card qualifies");
      if (card.networks[0] !== offer.network) return no(`Only on ${offer.network} cards`);
    }
    if (offer.cardNames?.length) {
      const names = [card.name, card.label].filter((x): x is string => !!x).map(norm);
      const hit = offer.cardNames.some((n) => names.some((have) => have.includes(norm(n)) || norm(n).includes(have)));
      if (!hit) return no("Couldn't confirm this card qualifies");
    }
  }

  let discount = offer.percent !== undefined ? (price * offer.percent) / 100 : (offer.flat ?? 0);
  if (offer.percent !== undefined && offer.flat !== undefined) discount = Math.max(discount, offer.flat);
  if (offer.maxDiscount !== undefined) discount = Math.min(discount, offer.maxDiscount);
  discount = Math.floor(Math.min(discount, price));
  if (discount <= 0) return no("Worth nothing on this price");
  return { eligible: true, discount, reason: offer.type === "cashback" ? "Cashback, credited later" : "Applies" };
}

/**
 * All offers on one payment option. Offers of the same type don't stack
 * (shops allow one bank offer per order): the biggest of each type wins.
 */
export function applyOffers(offers: OfferSpec[], card: OfferCard | null, price: number, opts: { emi?: boolean } = {}) {
  const applied: { rawText: string; discount: number; type: OfferSpec["type"] }[] = [];
  const skipped: { rawText: string; reason: string }[] = [];
  for (const o of offers) {
    const r = applyOffer(o, card, price, opts);
    if (r.eligible) applied.push({ rawText: o.rawText, discount: r.discount, type: o.type });
    else if (o.type !== "no_cost_emi") skipped.push({ rawText: o.rawText, reason: r.reason });
  }
  const bestByType = new Map<string, (typeof applied)[number]>();
  for (const a of applied) {
    const cur = bestByType.get(a.type);
    if (!cur || a.discount > cur.discount) bestByType.set(a.type, a);
  }
  const kept = [...bestByType.values()];
  for (const a of applied) if (!kept.includes(a)) skipped.push({ rawText: a.rawText, reason: "Doesn't stack with a bigger offer of the same kind" });
  const total = Math.min(price, kept.reduce((s, a) => s + a.discount, 0));
  return { discount: total, applied: kept.map(({ rawText, discount }) => ({ rawText, discount })), skipped };
}
