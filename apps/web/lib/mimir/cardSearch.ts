import { searchGroundedText, extractStructuredJson, type ResponseSchema } from "@perq/ai";
import type { QuizAnswers } from "@perq/scoring-engine";
import { cardSearchResultSchema, type CardSearchResult } from "./cardSearchSchema";

// D15: how many candidate cards a bucket refresh keeps (the user's "capped
// to 20 results" requirement) and the floor below which a search is treated
// as too thin to trust over the curated DB fallback.
export const MAX_SEARCH_CARDS = 20;
export const MIN_VALID_SEARCH_CARDS = 5;

const CARD_RESPONSE_SCHEMA: ResponseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      issuer: { type: "string" },
      network: { type: "string" },
      tier: { type: "string", nullable: true },
      joiningFee: { type: "number" },
      annualFee: { type: "number" },
      feeWaiverCondition: { type: "string", nullable: true },
      rewardRates: {
        type: "object",
        properties: {
          dining: { type: "number" },
          travel: { type: "number" },
          hotels: { type: "number" },
          fuel: { type: "number" },
          groceries: { type: "number" },
          ecommerce: { type: "number" },
          utilities: { type: "number" },
          general: { type: "number" },
        },
      },
      milestoneBenefits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            spendThreshold: { type: "number" },
            bonusValue: { type: "number" },
          },
          required: ["spendThreshold", "bonusValue"],
        },
      },
      welcomeBonus: { type: "string", nullable: true },
      forexMarkupPct: { type: "number", nullable: true },
      redemptionValue: { type: "number", nullable: true },
      minIncomeEligibility: { type: "number", nullable: true },
      coBrandPartner: { type: "string", nullable: true },
      sourceUrls: { type: "array", items: { type: "string" } },
    },
    required: ["name", "issuer", "network", "joiningFee", "annualFee", "rewardRates", "sourceUrls"],
  },
};

/**
 * The natural-language query for Step A's grounded search — built only from
 * the coarse signals in computeSearchBucketKey (income, fee tolerance,
 * priority categories), since that's what this search result gets cached
 * and shared against.
 */
export function buildCardSearchQuery(answers: QuizAnswers): string {
  const categories =
    answers.priorityCategories.length > 0
      ? answers.priorityCategories.join(" and ")
      : "everyday spending";
  const feePref = answers.feeTolerant
    ? "open to paying an annual fee if the rewards justify it"
    : "prefers a ₹0 or low annual fee";

  return `Search for real, currently-marketed Indian credit cards well-suited to someone with annual income in the ${answers.annualIncome} bracket, who prioritizes ${categories} spend, and who ${feePref}. Find up to ${MAX_SEARCH_CARDS} distinct cards from a mix of issuers. For each, note its issuer, card network, joining fee, annual fee, any fee waiver condition, reward rates by spend category (dining, travel, hotels, fuel, groceries, ecommerce, utilities, general) as a decimal fraction of spend, milestone benefits, welcome bonus, forex markup, redemption value per point, minimum income eligibility, and any co-brand partner.`;
}

function buildExtractionPrompt(researchNotes: string, citationUris: string[]): string {
  return `From the research notes below, extract up to ${MAX_SEARCH_CARDS} distinct real Indian credit cards as structured data.

For each card, you MUST attribute its annualFee and rewardRates to at least one of the source URLs listed below, and include that URL (or URLs) in sourceUrls. Only use URLs from this exact list — never invent one. If you cannot attribute a card's core terms to one of these sources, omit that card entirely rather than guessing.

SOURCE URLS AVAILABLE:
${citationUris.map((uri) => `- ${uri}`).join("\n")}

RESEARCH NOTES:
${researchNotes}`;
}

/**
 * Orchestrates the D15 two-call pattern (grounded search, then structured
 * extraction) and validates the result: any card whose sourceUrls doesn't
 * contain at least one URL actually present in the grounded search's own
 * citations is dropped whole — not partially nulled, since a silently
 * zeroed reward category would misscore a card rather than exclude it.
 * Throws on a hard API failure; the caller (resolveCardSet) decides the
 * fallback behavior, mirroring how computeAndPersistRecommendations already
 * wraps runGeminiAgent (D7's pattern).
 */
export async function searchCardsForBucket(
  answers: QuizAnswers,
  apiKey: string
): Promise<CardSearchResult[]> {
  const query = buildCardSearchQuery(answers);
  const { text, citations } = await searchGroundedText(apiKey, query);
  if (citations.length === 0 || !text) return [];

  const citationUris = citations.map((c) => c.uri);
  const raw = await extractStructuredJson(
    apiKey,
    buildExtractionPrompt(text, citationUris),
    CARD_RESPONSE_SCHEMA
  );

  if (!Array.isArray(raw)) return [];

  const citationUriSet = new Set(citationUris);
  const seen = new Set<string>();
  const valid: CardSearchResult[] = [];

  // Validate card-by-card, not as one array schema — a single malformed
  // card (bad enum value, missing field) shouldn't discard every other
  // otherwise-good card the model extracted correctly.
  for (const raw_card of raw) {
    const result = cardSearchResultSchema.safeParse(raw_card);
    if (!result.success) continue;
    const card = result.data;

    const attributedUrls = card.sourceUrls.filter((url) => citationUriSet.has(url));
    if (attributedUrls.length === 0) continue; // no real citation — drop the whole card

    const dedupeKey = `${card.issuer.trim().toLowerCase()}::${card.name.trim().toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    valid.push({ ...card, sourceUrls: attributedUrls });
    if (valid.length >= MAX_SEARCH_CARDS) break;
  }

  return valid;
}
