import { and, eq } from "drizzle-orm";
import { db, cards, goalRecommendations, goals, userCardArsenal, userProfile } from "@perq/db";
import { runGeminiAgent, createGeminiModelCaller } from "@perq/ai";
import type { QuizAnswers, ArsenalCard, PurchaseOffer, FinancialContext } from "@perq/scoring-engine";
import { scorePaymentOptions } from "@perq/scoring-engine";
import { understandGoal } from "./understandGoal";
import type { ClarificationTurn } from "./clarification";
import { discoverPurchaseOptions } from "./discoverPurchaseOptions";
import { refinePricesWithPrecisionFetch } from "./precisionFetch";
import { createGoalTools } from "./tools";
import { GOAL_NARRATION_SYSTEM_PROMPT } from "./prompt";
import { goalNarrationLabelForStep } from "./narrationLabels";
import { buildGoalFallbackExplanation } from "./explanationFallback";

export interface OfferCheckResult {
  source: string;
  sourceUrl: string;
  outcome: "succeeded" | "unconfirmed_price";
  price?: number;
}

export type ComputeGoalRecommendationResult =
  | { outcome: "unsupported" }
  | { outcome: "needs_clarification"; question: string }
  | { outcome: "total_failure" }
  | { outcome: "no_listings_found"; offersChecked: OfferCheckResult[] }
  | { outcome: "success"; goalRecommendationId: string; offersChecked: OfferCheckResult[] };

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
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
 * v2 (open-ended web-search redesign): understand → discover (grounded
 * search) → bounded precision-fetch → score (+ BNPL) → narrate → persist.
 * Mirrors computeAndPersistRecommendations' orchestration role for
 * Feature 1, and this file's own v1 role, just with the fixed-category/
 * fixed-channel pipeline replaced end to end.
 *
 * The caller (the SSE route) is responsible for the rate-limit check and
 * writing the initial `goals` row (category:'pending') on the FIRST turn of
 * a session — this function only updates that row's category and, on
 * success, writes the goal_recommendations row. Follow-up clarification
 * turns reuse the same goalId and never re-check the rate limit.
 */
export async function computeAndPersistGoalRecommendation(
  userId: string,
  goalId: string,
  goalText: string,
  clarification: ClarificationTurn[],
  onNarrationStep?: (label: string) => void
): Promise<ComputeGoalRecommendationResult> {
  const apiKey = requireGeminiKey();

  onNarrationStep?.("MIMIR is figuring out what you mean");
  const understanding = await understandGoal(goalText, clarification, apiKey);

  if (!understanding.ok) {
    if (understanding.reason === "needs_clarification") {
      // Not yet resolved — goals.category stays 'pending', nothing to
      // persist yet.
      return { outcome: "needs_clarification", question: understanding.question };
    }
    await db.update(goals).set({ category: "unsupported" }).where(eq(goals.id, goalId));
    return { outcome: "unsupported" };
  }

  const { category, facts } = understanding;
  await db.update(goals).set({ category }).where(eq(goals.id, goalId));

  onNarrationStep?.("MIMIR is searching the web");
  let discovery;
  try {
    discovery = await discoverPurchaseOptions(facts, apiKey);
  } catch {
    // A hard Gemini/search failure here (distinct from "searched but found
    // nothing," which discoverPurchaseOptions itself resolves to an empty
    // offers list) gets the same explicit "couldn't complete this search"
    // UX as a total pipeline failure, not a generic bare error message.
    return { outcome: "total_failure" };
  }

  if (discovery.offers.length === 0) {
    return { outcome: "no_listings_found", offersChecked: [] };
  }

  onNarrationStep?.("MIMIR is checking real listings");
  const refinedOffers = await refinePricesWithPrecisionFetch(
    discovery.offers,
    apiKey,
    process.env.JINA_API_KEY
  );

  const offersChecked: OfferCheckResult[] = refinedOffers.map((o) => ({
    source: o.sourceLabel,
    sourceUrl: o.sourceUrl,
    outcome: o.price != null ? "succeeded" : "unconfirmed_price",
    ...(o.price != null ? { price: o.price } : {}),
  }));

  const purchaseOffers: PurchaseOffer[] = refinedOffers
    .filter((o): o is typeof o & { price: number } => o.price != null)
    .map((o) => ({ source: o.sourceLabel, sourceUrl: o.sourceUrl, price: o.price }));

  if (purchaseOffers.length === 0) {
    return { outcome: "no_listings_found", offersChecked };
  }

  onNarrationStep?.("MIMIR is factoring in your cards");

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

  // Single join query for the full held arsenal, not a per-card tool call —
  // deterministic scoring needs every held card unconditionally.
  const arsenalRows = await db
    .select({ cardId: userCardArsenal.cardId, name: cards.name, rewardRates: cards.rewardRates })
    .from(userCardArsenal)
    .innerJoin(cards, eq(cards.id, userCardArsenal.cardId))
    .where(and(eq(userCardArsenal.userId, userId), eq(userCardArsenal.status, "held")));

  const arsenalCards: ArsenalCard[] = arsenalRows.map((r) =>
    mapArsenalRow({ id: r.cardId, rewardRates: r.rewardRates }, r.name)
  );

  const options = scorePaymentOptions(
    purchaseOffers,
    arsenalCards,
    category,
    financialContext,
    discovery.cardOfferNote
  );
  const winner = options[0]!;

  const tools = createGoalTools({ goalText, options });

  let explanation: string;
  try {
    const agentResult = await runGeminiAgent({
      systemPrompt: GOAL_NARRATION_SYSTEM_PROMPT,
      history: [{ role: "user", content: "Write MIMIR's recommendation for this goal now." }],
      tools,
      callModel: createGeminiModelCaller(apiKey),
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
    // A Gemini call failure here must never take down a search whose
    // discovery data already succeeded — fall back to the grounded
    // template.
    explanation = buildGoalFallbackExplanation(winner);
  }

  const [inserted] = await db
    .insert(goalRecommendations)
    .values({
      goalId,
      userId,
      recommendedChannel: winner.source,
      recommendedSourceUrl: winner.sourceUrl,
      recommendedCardId: winner.cardId,
      paymentMethod: winner.paymentMethod,
      bnplNote: winner.bnplNote,
      cardOfferNote: discovery.cardOfferNote,
      cardOfferCitationUrl: discovery.cardOfferCitationUrl,
      billingCycleNote: winner.billingCycleNote,
      explanation,
      channelsChecked: offersChecked,
      agent: "MIMIR",
    })
    .returning({ id: goalRecommendations.id });

  return { outcome: "success", goalRecommendationId: inserted!.id, offersChecked };
}
