import { searchWebWithFallback, extractJsonWithFallback } from "@perq/ai";
import type { GoalFacts } from "./understandGoal";
import {
  discoveredOfferSchema,
  DISCOVERY_RESPONSE_SCHEMA,
  cardOfferSchema,
  CARD_OFFER_RESPONSE_SCHEMA,
  type DiscoveredOffer,
} from "./discoverySchema";

// Token economy / cost bound — same spirit as MAX_SEARCH_CARDS in
// apps/web/lib/mimir/cardSearch.ts.
export const MAX_DISCOVERED_OFFERS = 8;

// PERQ is an India-only product (₹ pricing, Indian card issuers/BNPL
// throughout) — unlike packages/ai, which stays geography-agnostic, this
// file is exactly where that domain assumption belongs. Verified live:
// Firecrawl's search has no inherent geographic bias — the identical query
// text (even one that already asks for "prices in INR") surfaced all-US
// retailers without a location hint, and real India-facing ones
// (apple.com/in, Flipkart, Amazon.in) with one. Used both as the query's
// stated location AND Firecrawl's `location` param (searchWebWithFallback's
// firecrawlLocation) — belt and suspenders, since the param alone wasn't
// tested in isolation and both are cheap to include.
const DEFAULT_LOCATION = "India";

export interface DiscoveryResult {
  offers: DiscoveredOffer[];
  cardOfferNote: string | null;
  cardOfferCitationUrl: string | null;
}

function describeGoal(facts: GoalFacts): string {
  const parts = [facts.subject];
  if (facts.variant) parts.push(facts.variant);
  parts.push(`in ${facts.location ?? DEFAULT_LOCATION}`);
  return parts.join(" ");
}

function buildDiscoveryQuery(facts: GoalFacts): string {
  return `Where can I buy or book ${describeGoal(facts)}? Give real, current, specific listings with prices in INR and the exact website or platform selling/offering each one. Include the direct URL for each listing.`;
}

/**
 * Requires every extracted listing be attributed to a real citation URL —
 * same discipline as apps/web/lib/mimir/cardSearch.ts's buildExtractionPrompt.
 */
function buildExtractionPrompt(researchNotes: string, citationUris: string[]): string {
  return `From the research notes below, extract up to ${MAX_DISCOVERED_OFFERS} distinct real purchase listings/options as structured data.

For each listing, you MUST use a sourceUrl from the exact list below — never invent one. If you cannot attribute a listing to one of these sources, omit it entirely rather than guessing.

PRICE DISCIPLINE — this matters more than filling every field:
- Only set a price if you can point to the specific number in the research notes below that IS that listing's price (not a rating, a review score, a model number, a year, a percentage, or any other unrelated number that happens to appear near the listing).
- The price must be stated in Indian Rupees (₹ or "INR" or "Rs"). If the notes only give a price in another currency (e.g. $, USD) or the currency is unclear, treat it as not found — do NOT convert or guess an equivalent.
- If a listing is clearly real but you cannot find its actual INR price stated in the notes, set price to null. A null price is the CORRECT, expected answer when the notes don't contain one — it is not a failure, and a wrong guessed number is much worse than null.

SOURCE URLS AVAILABLE:
${citationUris.map((uri) => `- ${uri}`).join("\n")}

RESEARCH NOTES:
${researchNotes}`;
}

function buildCardOfferQuery(facts: GoalFacts): string {
  return `Are there any current credit card, bank, or payment-platform offers (cashback, instant discount, no-cost EMI) for buying ${describeGoal(facts)}? Only report a specific, real, currently active offer if one genuinely exists.`;
}

function buildCardOfferExtractionPrompt(researchNotes: string, citationUris: string[]): string {
  return `From the research notes below, determine whether a real, specific card/bank/payment-platform offer was found.

If a real offer is described, set found:true, write a short "note" describing it in one sentence, and set "citationUrl" to the exact source URL (from the list below) that mentions it. Never invent an offer or a URL.

If no specific offer is described, set found:false and omit the other fields.

SOURCE URLS AVAILABLE:
${citationUris.map((uri) => `- ${uri}`).join("\n")}

RESEARCH NOTES:
${researchNotes}`;
}

/**
 * Validates each extracted listing individually (never as one array schema)
 * — a single malformed item shouldn't discard every other otherwise-good
 * item. Drops (never partially-nulls) anything failing schema validation or
 * whose sourceUrl isn't one of the real citation URIs. Dedupes by
 * normalized sourceUrl, caps at MAX_DISCOVERED_OFFERS.
 */
function validateOffers(raw: unknown, citationUris: string[]): DiscoveredOffer[] {
  if (!Array.isArray(raw)) return [];

  const citationUriSet = new Set(citationUris);
  const seen = new Set<string>();
  const valid: DiscoveredOffer[] = [];

  for (const item of raw) {
    const result = discoveredOfferSchema.safeParse(item);
    if (!result.success) continue;
    const offer = result.data;

    if (!citationUriSet.has(offer.sourceUrl)) continue; // no real citation — drop

    const dedupeKey = offer.sourceUrl.trim().toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    valid.push(offer);
    if (valid.length >= MAX_DISCOVERED_OFFERS) break;
  }

  return valid;
}

/**
 * Second, optional grounded call — only run once discovery already found at
 * least one real offer, keeping the "1-2 grounded calls" cost budget honest.
 * Never surfaces a note unless it's attributable to a real citation from
 * THIS call's own citation set — same never-invent discipline as the main
 * discovery step.
 */
async function discoverCardOffer(
  facts: GoalFacts,
  apiKey: string,
  firecrawlApiKey?: string,
  groqApiKey?: string
): Promise<{ cardOfferNote: string | null; cardOfferCitationUrl: string | null }> {
  const { text, citations } = await searchWebWithFallback(buildCardOfferQuery(facts), {
    geminiApiKey: apiKey,
    firecrawlApiKey,
    firecrawlLocation: DEFAULT_LOCATION,
  });
  if (citations.length === 0 || !text) return { cardOfferNote: null, cardOfferCitationUrl: null };

  const citationUris = citations.map((c) => c.uri);
  const raw = await extractJsonWithFallback(
    buildCardOfferExtractionPrompt(text, citationUris),
    CARD_OFFER_RESPONSE_SCHEMA,
    { geminiApiKey: apiKey, groqApiKey }
  );

  // CARD_OFFER_RESPONSE_SCHEMA only requires "found" — note/citationUrl are
  // only guaranteed present when found:true, so check that first before
  // validating the rest against cardOfferSchema's stricter shape.
  const rawObj = raw as { found?: boolean; note?: unknown; citationUrl?: unknown };
  if (!rawObj.found) return { cardOfferNote: null, cardOfferCitationUrl: null };

  const strict = cardOfferSchema.safeParse({ note: rawObj.note, citationUrl: rawObj.citationUrl });
  if (!strict.success) return { cardOfferNote: null, cardOfferCitationUrl: null };
  if (!citationUris.includes(strict.data.citationUrl)) {
    return { cardOfferNote: null, cardOfferCitationUrl: null }; // uncited — drop, never invent
  }

  return { cardOfferNote: strict.data.note, cardOfferCitationUrl: strict.data.citationUrl };
}

/**
 * Open-ended discovery: one required grounded search for the purchase
 * itself, one optional grounded search for a real card/bank offer (only run
 * if the first call found something). Structurally descended from
 * apps/web/lib/mimir/cardSearch.ts — same "search, cite, extract-with-
 * required-attribution, drop-uncited" pipeline, applied to purchase
 * listings instead of card data.
 */
export async function discoverPurchaseOptions(
  facts: GoalFacts,
  apiKey: string,
  firecrawlApiKey?: string,
  groqApiKey?: string
): Promise<DiscoveryResult> {
  const query = buildDiscoveryQuery(facts);
  const { text, citations } = await searchWebWithFallback(query, {
    geminiApiKey: apiKey,
    firecrawlApiKey,
    firecrawlLocation: DEFAULT_LOCATION,
  });
  if (citations.length === 0 || !text) {
    return { offers: [], cardOfferNote: null, cardOfferCitationUrl: null };
  }

  const citationUris = citations.map((c) => c.uri);
  const raw = await extractJsonWithFallback(
    buildExtractionPrompt(text, citationUris),
    DISCOVERY_RESPONSE_SCHEMA,
    { geminiApiKey: apiKey, groqApiKey }
  );
  const offers = validateOffers(raw, citationUris);

  if (offers.length === 0) {
    return { offers: [], cardOfferNote: null, cardOfferCitationUrl: null };
  }

  const cardOffer = await discoverCardOffer(facts, apiKey, firecrawlApiKey, groqApiKey);
  return { offers, ...cardOffer };
}
