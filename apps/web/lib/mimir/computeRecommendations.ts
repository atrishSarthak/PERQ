import { eq } from "drizzle-orm";
import { db, cards, recommendations, type Card as DbCard } from "@perq/db";
import {
  buildProfileFromAnswers,
  scoreCards,
  type QuizAnswers,
} from "@perq/scoring-engine";
import { runGeminiAgent, createGeminiModelCaller, type AgentStepEvent } from "@perq/ai";
import { computeCardsVersion, computeProfileHash } from "./hash";
import { findCachedTopExplanation } from "./cache";
import { buildTemplateExplanation } from "./explanationTemplate";
import { createMimirTools } from "./tools";
import { EXPLANATION_SYSTEM_PROMPT } from "./prompt";
import { narrationLabelForStep } from "./narrationLabels";
import { mapDbCardToScoringCard } from "./cardMapper";

export interface ComputeRecommendationsResult {
  topCardId: string;
  explanationSource: "gemini" | "fallback_template";
  recommendationCount: number;
  topCardChanged: boolean;
}

export interface PreviousTopCard {
  cardId: string;
  explanation: string;
  explanationSource: "gemini" | "fallback_template";
}

/**
 * The shared pipeline behind both quiz-submit (T6) and profile-edit
 * re-scoring (T8): load cards, score deterministically (D1), then decide
 * whether a fresh Gemini call is needed at all — two independent guards,
 * per §9.5 and D6:
 *
 *   1. previousTopCard (edit flow only): if the #1 card hasn't changed,
 *      reuse its existing explanation verbatim — no cache lookup, no
 *      Gemini call, regardless of whether other spend numbers shifted
 *      slightly. This is the §9.5 guard, and it fires BEFORE the D6 check.
 *   2. D6/D10 cache (both flows): if the #1 card changed (or this is a
 *      fresh quiz-submit with no previous state), check whether this exact
 *      profile+cards combination was already explained before reusing it.
 *
 * Falls back to a template on failure/cap-exceeded (D7), then delete-and-
 * replaces the user's recommendations (D14).
 *
 * onNarrationStep is called with a display label for each real event, in
 * order — the SSE route handler forwards these directly (D3, revised).
 */
export async function computeAndPersistRecommendations(
  userId: string,
  answers: QuizAnswers,
  onNarrationStep?: (label: string) => void,
  previousTopCard?: PreviousTopCard
): Promise<ComputeRecommendationsResult> {
  const activeCards = await db.select().from(cards).where(eq(cards.status, "active"));
  const dbCardsById = new Map<string, DbCard>(activeCards.map((c) => [c.id, c]));

  const profile = buildProfileFromAnswers(answers);
  const scoringCards = activeCards.map((c) => mapDbCardToScoringCard(c));
  const scored = scoreCards(profile, scoringCards);
  const eligible = scored.filter((s) => s.eligible);

  if (eligible.length === 0) {
    // No card in the active database matches this user's income eligibility —
    // still resolve rather than throw; caller can decide how to render an
    // empty-recommendations state. Not explicitly specced (edge case beyond
    // the locked plan), so fail soft rather than 500.
    await db.delete(recommendations).where(eq(recommendations.userId, userId));
    return {
      topCardId: "",
      explanationSource: "fallback_template",
      recommendationCount: 0,
      topCardChanged: true,
    };
  }

  const profileHash = computeProfileHash(answers);
  const cardsVersion = computeCardsVersion(activeCards);
  const topScored = eligible[0]!;
  const topCardChanged = previousTopCard ? previousTopCard.cardId !== topScored.card.id : true;

  const cached = await findCachedTopExplanation(userId, profileHash, cardsVersion);

  let topExplanation: string;
  let explanationSource: "gemini" | "fallback_template";

  if (previousTopCard && !topCardChanged) {
    // §9.5: #1 unchanged — reuse the existing explanation as-is, don't even
    // check the D6 cache. Preserves whatever the prior source actually was
    // (don't relabel a past fallback as a real Gemini explanation).
    topExplanation = previousTopCard.explanation;
    explanationSource = previousTopCard.explanationSource;
  } else if (cached && cached.cardId === topScored.card.id) {
    topExplanation = cached.explanation;
    explanationSource = "gemini"; // a cache hit only ever reuses a prior real explanation
  } else {
    const tools = createMimirTools({ answers, profile, scored: eligible, dbCardsById });

    // D7 requires the feature to degrade gracefully on ANY Gemini failure
    // (network error, 429 quota exhaustion, 5xx) — not just the cappedOut
    // case. runGeminiAgent's callModel throws on a non-2xx response (the
    // SDK's own behavior); without this try/catch that exception would
    // propagate straight out of computeAndPersistRecommendations and crash
    // the whole request with no ranked list at all, exactly what D7 exists
    // to prevent. Caught live during E2E verification by genuinely
    // exhausting the free-tier daily quota mid-session (see T14/T19).
    let agentResult: Awaited<ReturnType<typeof runGeminiAgent>> | null = null;
    try {
      agentResult = await runGeminiAgent({
        systemPrompt: EXPLANATION_SYSTEM_PROMPT,
        history: [
          {
            role: "user",
            content:
              "Write MIMIR's explanation for this user's #1 recommended card now.",
          },
        ],
        tools,
        callModel: createGeminiModelCaller(requireGeminiKey()),
        onStep: (event: AgentStepEvent) => {
          const label = narrationLabelForStep(
            event,
            (cardId) => dbCardsById.get(cardId)?.name
          );
          if (label) onNarrationStep?.(label);
        },
      });
    } catch {
      agentResult = null; // falls through to the D7 fallback below
    }

    if (agentResult?.finalText && !agentResult.cappedOut) {
      topExplanation = agentResult.finalText;
      explanationSource = "gemini";
    } else {
      // D7: Gemini failed, quota exhausted, or the tool-loop cap (D13) was
      // exceeded — still ship the ranked list, never block the feature.
      const dbCard = dbCardsById.get(topScored.card.id);
      topExplanation = buildTemplateExplanation(topScored, dbCard?.name ?? "your top card");
      explanationSource = "fallback_template";
    }
  }

  // D14: delete-and-replace, not blind insert — makes "the user's current
  // recommendations" unambiguous and a double-submit idempotent. Sequential
  // statements, not a true transaction — the neon-http driver used here
  // doesn't support interactive transactions (confirmed against its type
  // declarations). A failure between delete and insert is recoverable by
  // resubmitting; acceptable at this project's scale, documented rather
  // than silently assumed atomic.
  await db.delete(recommendations).where(eq(recommendations.userId, userId));

  const rows = eligible.map((s, index) => {
    const rank = index + 1;
    const dbCard = dbCardsById.get(s.card.id);
    const explanation =
      rank === 1 ? topExplanation : buildTemplateExplanation(s, dbCard?.name ?? s.card.id);
    return {
      userId,
      cardId: s.card.id,
      rank,
      score: s.score.toString(),
      explanation,
      agent: "MIMIR",
      profileSnapshot: answers,
      profileHash,
      cardsVersion,
      explanationSource: rank === 1 ? explanationSource : ("template" as const),
    };
  });

  if (rows.length > 0) {
    await db.insert(recommendations).values(rows);
  }

  return {
    topCardId: topScored.card.id,
    explanationSource,
    recommendationCount: rows.length,
    topCardChanged,
  };
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}
