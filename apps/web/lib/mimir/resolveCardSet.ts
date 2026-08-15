import { and, eq } from "drizzle-orm";
import { db, cards, type Card as DbCard, type NewCard } from "@perq/db";
import type { QuizAnswers } from "@perq/scoring-engine";
import { computeSearchBucketKey } from "./hash";
import { searchCardsForBucket, MIN_VALID_SEARCH_CARDS } from "./cardSearch";
import type { CardSearchResult } from "./cardSearchSchema";

// D15: how long a bucket's web-search results stay trusted before a fresh
// search is triggered. Coarse and generous on purpose — card terms don't
// change daily, and every bucket refresh costs 2 Gemini calls, so this is
// what actually keeps usage well under the free-tier daily quota.
export const SEARCH_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type CardSourceMode = "web_search" | "db_fallback";

export interface ResolvedCardSet {
  activeCards: DbCard[];
  cardSourceMode: CardSourceMode;
  searchBucketKey: string;
}

/**
 * D15: resolves the card set computeAndPersistRecommendations should score
 * against — MIMIR's live web search first, the curated DB catalog as a
 * fallback that "should rarely happen" (only on a genuine search failure
 * or too-few-valid-results, never silently preferred). A fresh cache hit
 * for this bucket costs zero Gemini calls; a cache miss/stale bucket costs
 * exactly one bucket refresh (2 calls), not one search per user or per
 * quiz submission.
 *
 * forceRefresh (added for the "always search fresh right after the quiz"
 * fix): skips the cache-freshness check below entirely, so a completed
 * quiz (new user or a "Retake the Quiz") always attempts a live search
 * grounded in that submission's own context, rather than possibly reusing
 * up to 14-day-old results. The result still gets written back to the
 * shared bucket cache (replaceBucketCards) so other users/edits in the
 * same bucket benefit from it too. Callers should reserve this for the
 * "user just finished the quiz" moment — the cheap, no-loading-state
 * profile-edit path (§11/§9.5) should NOT pass this, since that path is
 * explicitly meant to avoid extra Gemini calls. This does mean quiz
 * completions cost real quota on every submit — expected and accepted
 * tradeoff, not a bug.
 */
export async function resolveCardSet(
  answers: QuizAnswers,
  onNarrationStep?: (label: string) => void,
  forceRefresh = false
): Promise<ResolvedCardSet> {
  const searchBucketKey = computeSearchBucketKey(answers);

  if (!forceRefresh) {
    const bucketCards = await db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.origin, "web_search"),
          eq(cards.searchBucketKey, searchBucketKey),
          eq(cards.status, "active")
        )
      );

    const freshCutoff = Date.now() - SEARCH_CACHE_TTL_MS;
    const isFresh =
      bucketCards.length > 0 && bucketCards[0]!.sourceUpdatedAt.getTime() > freshCutoff;

    if (isFresh) {
      return { activeCards: bucketCards, cardSourceMode: "web_search", searchBucketKey };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      onNarrationStep?.("MIMIR is searching the web for cards");
      const results = await searchCardsForBucket(answers, apiKey);
      if (results.length >= MIN_VALID_SEARCH_CARDS) {
        const inserted = await replaceBucketCards(searchBucketKey, results);
        onNarrationStep?.(`MIMIR found ${inserted.length} cards from the web`);
        return { activeCards: inserted, cardSourceMode: "web_search", searchBucketKey };
      }
    } catch {
      // A search failure must never block scoring — fall through to the DB
      // fallback below, same spirit as D7's Gemini-explanation fallback.
    }
  }

  onNarrationStep?.("MIMIR is using its trusted card list");
  const fallbackCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.origin, "seeded"), eq(cards.status, "active")));

  return { activeCards: fallbackCards, cardSourceMode: "db_fallback", searchBucketKey };
}

/**
 * 2C-style soft delete, reused rather than reinvented: old rows for this
 * bucket are marked 'discontinued', never hard-deleted. A hard delete would
 * violate recommendations.card_id's FK for any other user in the same
 * bucket whose recommendations still reference the old rows and haven't
 * resubmitted since the refresh.
 */
async function replaceBucketCards(
  searchBucketKey: string,
  results: CardSearchResult[]
): Promise<DbCard[]> {
  await db
    .update(cards)
    .set({ status: "discontinued" })
    .where(
      and(
        eq(cards.origin, "web_search"),
        eq(cards.searchBucketKey, searchBucketKey),
        eq(cards.status, "active")
      )
    );

  const now = new Date();
  const rows: NewCard[] = results.map((c) => ({
    name: c.name,
    issuer: c.issuer,
    network: c.network,
    tier: c.tier ?? null,
    joiningFee: c.joiningFee.toString(),
    annualFee: c.annualFee.toString(),
    feeWaiverCondition: c.feeWaiverCondition ?? null,
    rewardRates: c.rewardRates,
    milestoneBenefits: c.milestoneBenefits,
    welcomeBonus: c.welcomeBonus ?? null,
    loungeAccess: c.loungeAccess ?? null,
    forexMarkupPct: c.forexMarkupPct?.toString() ?? null,
    redemptionValue: c.redemptionValue?.toString() ?? null,
    minIncomeEligibility: c.minIncomeEligibility?.toString() ?? null,
    coBrandPartner: c.coBrandPartner ?? null,
    status: "active",
    origin: "web_search",
    searchBucketKey,
    sourceUrls: c.sourceUrls,
    sourceUpdatedAt: now,
  }));

  return db.insert(cards).values(rows).returning();
}
