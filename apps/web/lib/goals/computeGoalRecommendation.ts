import { and, eq } from "drizzle-orm";
import { db, cards, goalRecommendations, goals, userCardArsenal, userProfile } from "@perq/db";
import { fetchPage } from "@perq/fetch";
import { extractStructuredJson, runGeminiAgent, createGeminiModelCaller } from "@perq/ai";
import type { QuizAnswers, ArsenalCard, ChannelResult, FinancialContext } from "@perq/scoring-engine";
import { scorePaymentOptions } from "@perq/scoring-engine";
import { classifyGoal } from "./classifyGoal";
import { CHANNELS_BY_CATEGORY, CHANNEL_DISPLAY_NAME, buildSearchUrl, type Channel } from "./channels";
import { computeQueryKey } from "./hash";
import { findFreshCacheEntry, upsertCacheEntry } from "./cache";
import {
  channelExtractionSchema,
  CHANNEL_RESPONSE_SCHEMA,
  movieListingExtractionSchema,
  MOVIE_LISTING_RESPONSE_SCHEMA,
  type ChannelExtractionResult,
} from "./extractionSchema";
import { createGoalTools } from "./tools";
import { GOAL_NARRATION_SYSTEM_PROMPT } from "./prompt";
import { goalNarrationLabelForStep } from "./narrationLabels";
import { buildGoalFallbackExplanation } from "./explanationFallback";

export type ChannelOutcome = "failed" | "checked_empty" | "succeeded";

export interface ChannelCheckResult {
  channel: Channel;
  outcome: ChannelOutcome;
  price?: number;
  title?: string;
}

export type ComputeGoalRecommendationResult =
  | { outcome: "unsupported" }
  | { outcome: "missing_info"; missingField: string }
  | { outcome: "total_failure" }
  | { outcome: "no_listings_found"; channelsChecked: ChannelCheckResult[] }
  | { outcome: "success"; goalRecommendationId: string; channelsChecked: ChannelCheckResult[] };

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

function requireFirecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

function buildExtractionPrompt(markdown: string, goalText: string): string {
  return `A user stated this purchase goal: "${goalText}"

Below is the Markdown content of a page from a shopping/booking channel — this may be a page filtered to the search terms, or a broader listing (e.g. "everything showing in this city") that you need to scan for the specific match yourself. Determine whether a real, specific listing matching the goal (a specific showtime, ticket, or product with a real price) is present anywhere in this content, or not.

If a matching listing IS present, set found:true and extract its price (a plain number, no currency symbol) and a short title describing it. Do not invent a price or title that isn't actually visible in the content below — if you can't find a real price, set found:false instead of guessing one.

If no matching listing is present (nothing relevant found on this page), set found:false and omit the other fields.

PAGE CONTENT:
${markdown.slice(0, 30000)}`;
}

// T0 finding (2026-08-16, live test): bookmyshow/district's real, working
// URLs are city-wide "movies now showing" listings, not a filtered search
// — they show WHICH movies are playing, not per-showtime prices. Hop 1's
// prompt finds the matching movie's own detail-page URL within the
// listing; hop 2 reuses buildExtractionPrompt/CHANNEL_RESPONSE_SCHEMA
// unchanged against that detail page for the real price.
function buildMovieListingPrompt(markdown: string, goalText: string): string {
  return `A user stated this purchase goal: "${goalText}"

Below is the Markdown content of a "movies now showing in this city" listing page — it lists many movies, each linking to its own detail/booking page. Find the specific movie this goal is asking about.

If a matching movie IS present in this listing, set found:true, extract its own detail-page URL (the href of the link for that specific movie — must be a real, complete URL actually present in the content below, never invented or guessed) and its title.

If no matching movie is present in this listing, set found:false and omit the other fields.

PAGE CONTENT:
${markdown.slice(0, 30000)}`;
}

async function extractPriceFromPage(
  markdown: string,
  goalText: string
): Promise<ChannelExtractionResult | null> {
  let raw: unknown;
  try {
    raw = await extractStructuredJson(
      requireGeminiKey(),
      buildExtractionPrompt(markdown, goalText),
      CHANNEL_RESPONSE_SCHEMA
    );
  } catch {
    return null;
  }
  const parsed = channelExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Hop 1 of the movie-category two-hop fetch (T0 finding, above): fetches
 * the channel's city listing page, has the model identify which detail-page
 * URL matches the goal (bounded to links actually present in that page's
 * own content — never a channel/domain the model invents, keeping D2's
 * "never open-ended discovery" guarantee even though the model is now
 * choosing a URL, not just reading data), then fetches and extracts price
 * from that detail page (hop 2, reusing extractPriceFromPage unchanged).
 * Returns null on any failure at either hop — the caller treats that the
 * same as a single-hop fetch/extraction failure ('failed').
 */
async function fetchMoviePriceViaListing(
  channel: Channel,
  entities: Parameters<typeof buildSearchUrl>[1],
  goalText: string
): Promise<ChannelExtractionResult | null> {
  const listingFetch = await fetchPage(buildSearchUrl(channel, entities), {
    apiKey: requireFirecrawlKey(),
  });
  if (!listingFetch.success) return null;

  let rawListing: unknown;
  try {
    rawListing = await extractStructuredJson(
      requireGeminiKey(),
      buildMovieListingPrompt(listingFetch.markdown, goalText),
      MOVIE_LISTING_RESPONSE_SCHEMA
    );
  } catch {
    return null;
  }

  const parsedListing = movieListingExtractionSchema.safeParse(rawListing);
  if (!parsedListing.success) return null;
  if (!parsedListing.data.found) return { found: false };

  const detailFetch = await fetchPage(parsedListing.data.detailUrl, {
    apiKey: requireFirecrawlKey(),
  });
  if (!detailFetch.success) return null;

  return extractPriceFromPage(detailFetch.markdown, goalText);
}

/**
 * Engineering Plan D2/D4/D5: deterministic per-channel fetch — the model
 * never chooses which CHANNEL to check or whether to check it; this
 * function always runs for exactly the 2 fixed channels of the resolved
 * category (§6). Checks D7's cache first; on a miss, fetches via
 * packages/fetch (D4: timeout + 1 retry, already built into fetchPage) and
 * extracts via a strict zod-validated structured call (D5) — any fetch or
 * extraction failure, or a validation failure, becomes outcome:'failed',
 * never partially-nulled data reaching the comparison step. The final
 * cached shape is always the same {found, price?, title?} regardless of
 * whether it took one hop or two to get there (T0 update) — D7's cache
 * design didn't need to change.
 */
async function checkChannel(
  channel: Channel,
  queryKey: string,
  category: Parameters<typeof scorePaymentOptions>[2],
  entities: Parameters<typeof buildSearchUrl>[1],
  goalText: string
): Promise<ChannelCheckResult> {
  const cached = await findFreshCacheEntry(channel, queryKey);
  if (cached) {
    return cached.outcome === "succeeded" && cached.data.found
      ? { channel, outcome: "succeeded", price: cached.data.price, title: cached.data.title }
      : { channel, outcome: "checked_empty" };
  }

  let result: ChannelExtractionResult | null;
  if (category === "movie") {
    result = await fetchMoviePriceViaListing(channel, entities, goalText);
  } else {
    const fetchResult = await fetchPage(buildSearchUrl(channel, entities), {
      apiKey: requireFirecrawlKey(),
    });
    result = fetchResult.success ? await extractPriceFromPage(fetchResult.markdown, goalText) : null;
  }

  if (result === null) {
    // D5: any fetch failure, extraction failure, or malformed/incomplete
    // model response at any hop discards the whole result — never
    // partially-nulled data reaches scoring.
    return { channel, outcome: "failed" };
  }

  if (!result.found) {
    await upsertCacheEntry(channel, queryKey, category, "checked_empty", result);
    return { channel, outcome: "checked_empty" };
  }

  await upsertCacheEntry(channel, queryKey, category, "succeeded", result);
  return { channel, outcome: "succeeded", price: result.price, title: result.title };
}

function mapArsenalRow(row: { id: string; rewardRates: unknown }, name: string): ArsenalCard {
  const raw = (row.rewardRates ?? {}) as Partial<Record<string, number>>;
  return {
    id: row.id,
    name,
    rewardRates: {
      dining: raw.dining ?? 0,
      travel: raw.travel ?? 0,
      hotels: raw.hotels ?? 0,
      fuel: raw.fuel ?? 0,
      groceries: raw.groceries ?? 0,
      ecommerce: raw.ecommerce ?? 0,
      utilities: raw.utilities ?? 0,
      general: raw.general ?? 0,
    },
  };
}

/**
 * Engineering Plan §3's full data flow: classify+extract entities (D6) →
 * deterministic channel fetch (D2, parallel per D4) → scorePaymentOptions
 * (D1) → Gemini narration call with D9 fallback → persist. Mirrors
 * computeAndPersistRecommendations' orchestration role for Feature 1.
 *
 * The caller (the SSE route) is responsible for D8's rate-limit check and
 * writing the initial `goals` row (category:'pending') BEFORE calling this
 * — this function only updates that row's category and, on success,
 * writes the goal_recommendations row.
 */
export async function computeAndPersistGoalRecommendation(
  userId: string,
  goalId: string,
  goalText: string,
  onNarrationStep?: (label: string) => void
): Promise<ComputeGoalRecommendationResult> {
  onNarrationStep?.("MIMIR is figuring out what you mean");
  const classification = await classifyGoal(goalText, requireGeminiKey());

  if (!classification.ok) {
    await db.update(goals).set({ category: "unsupported" }).where(eq(goals.id, goalId));
    return classification.reason === "unsupported"
      ? { outcome: "unsupported" }
      : { outcome: "missing_info", missingField: classification.missingField };
  }

  const { category, entities } = classification;
  await db.update(goals).set({ category }).where(eq(goals.id, goalId));

  const channelsForCategory = CHANNELS_BY_CATEGORY[category];
  const queryKey = computeQueryKey(category, entities);

  const checks = await Promise.all(
    channelsForCategory.map((channel) =>
      checkChannel(channel, queryKey, category, entities, goalText).then((result) => {
        const label =
          result.outcome === "failed"
            ? `MIMIR couldn't check ${CHANNEL_DISPLAY_NAME[channel]}`
            : `MIMIR checked ${CHANNEL_DISPLAY_NAME[channel]}`;
        onNarrationStep?.(label);
        return result;
      })
    )
  );

  const channelsChecked: ChannelCheckResult[] = checks;
  const allFailed = checks.every((c) => c.outcome === "failed");
  if (allFailed) {
    return { outcome: "total_failure" };
  }

  const channelResults: ChannelResult[] = checks
    .filter((c): c is ChannelCheckResult & { outcome: "succeeded"; price: number } =>
      c.outcome === "succeeded" && typeof c.price === "number"
    )
    .map((c) => ({ channel: c.channel, price: c.price }));

  if (channelResults.length === 0) {
    // At least one channel was genuinely checked (not a hard failure) but
    // no channel had a real listing — an honest "nothing found" outcome,
    // distinct from D9's total-failure (fetch/extraction breakage).
    return { outcome: "no_listings_found", channelsChecked };
  }

  const [profileRow] = await db
    .select({ answers: userProfile.answers })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  const answers = (profileRow?.answers as QuizAnswers | undefined) ?? undefined;

  const financialContext: FinancialContext = {
    statementDate: answers?.statementDate ?? null,
    paymentDueDate: answers?.paymentDueDate ?? null,
    outstandingBalance: answers?.outstandingBalance ?? null,
    creditLimit: answers?.creditLimit ?? null,
  };

  // Perf-A: single join query for the full held arsenal, not a per-card
  // tool call — deterministic scoring needs every held card unconditionally.
  const arsenalRows = await db
    .select({ cardId: userCardArsenal.cardId, name: cards.name, rewardRates: cards.rewardRates })
    .from(userCardArsenal)
    .innerJoin(cards, eq(cards.id, userCardArsenal.cardId))
    .where(and(eq(userCardArsenal.userId, userId), eq(userCardArsenal.status, "held")));

  const arsenalCards: ArsenalCard[] = arsenalRows.map((r) =>
    mapArsenalRow({ id: r.cardId, rewardRates: r.rewardRates }, r.name)
  );

  const options = scorePaymentOptions(channelResults, arsenalCards, category, financialContext);
  const winner = options[0]!;

  const tools = createGoalTools({ goalText, options });

  let explanation: string;
  try {
    const agentResult = await runGeminiAgent({
      systemPrompt: GOAL_NARRATION_SYSTEM_PROMPT,
      history: [
        { role: "user", content: "Write MIMIR's recommendation for this goal now." },
      ],
      tools,
      callModel: createGeminiModelCaller(requireGeminiKey()),
      onStep: (event) => {
        const label = goalNarrationLabelForStep(event);
        if (label) onNarrationStep?.(label);
      },
    });
    explanation =
      agentResult.finalText && !agentResult.cappedOut
        ? agentResult.finalText
        : buildGoalFallbackExplanation(winner);
  } catch {
    // D9: a Gemini call failure here must never take down a search whose
    // channel data already succeeded — fall back to the grounded template.
    explanation = buildGoalFallbackExplanation(winner);
  }

  const [inserted] = await db
    .insert(goalRecommendations)
    .values({
      goalId,
      userId,
      recommendedChannel: winner.channel,
      recommendedCardId: winner.cardId,
      billingCycleNote: winner.billingCycleNote,
      explanation,
      channelsChecked,
      agent: "MIMIR",
    })
    .returning({ id: goalRecommendations.id });

  return { outcome: "success", goalRecommendationId: inserted!.id, channelsChecked };
}
