import type { ToolDefinition } from "@perq/ai";
import type { QuizAnswers, ScoredCard, UserProfile } from "@perq/scoring-engine";
import type { Card as DbCard } from "@perq/db";

export interface MimirToolContext {
  answers: QuizAnswers;
  profile: UserProfile;
  scored: ScoredCard[]; // full ranked list, already computed (D1) before the agent runs
  dbCardsById: Map<string, DbCard>; // for name/issuer — not part of scoring-engine's pure Card type
}

const TOP_N_FOR_MODEL = 10; // token economy — don't hand the model all ~118 cards

/**
 * Feature-1-specific tools (D5, D8): getUserProfile, scoreCards, and
 * getCardDetails, illustrative per PRD §9.2 — all execute in-process
 * against already-loaded/already-computed data (D1: scoring is pure and
 * deterministic, computed once in route.ts before the agent runs; these
 * tools expose that data to the model via a real tool-call/result cycle,
 * they don't recompute it). Lives in apps/web, not packages/ai, per D5's
 * generic-runner/feature-specific-tools split.
 */
export function createMimirTools(ctx: MimirToolContext): ToolDefinition[] {
  const getUserProfile: ToolDefinition = {
    name: "getUserProfile",
    description:
      "Returns the user's quiz answers and derived monthly spend profile by category.",
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      answers: ctx.answers,
      categorySpend: ctx.profile.categorySpend,
      annualIncome: ctx.profile.annualIncome,
      feeTolerant: ctx.profile.feeTolerant,
      priorityCategories: ctx.profile.priorityCategories,
    }),
  };

  const scoreCards: ToolDefinition = {
    name: "scoreCards",
    description:
      "Returns the top-ranked cards for this user, already scored against their spend profile. Ground your explanation only in these numbers — never invent a card fact not present here or in getCardDetails.",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const top = ctx.scored.filter((s) => s.eligible).slice(0, TOP_N_FOR_MODEL);
      return top.map((s) => {
        const dbCard = ctx.dbCardsById.get(s.card.id);
        return {
          cardId: s.card.id,
          name: dbCard?.name ?? s.card.id,
          issuer: dbCard?.issuer ?? null,
          score: Math.round(s.score),
          annualFee: s.card.annualFee,
          topCategories: [...s.breakdown]
            .sort((a, b) => b.annualValue - a.annualValue)
            .slice(0, 3)
            .map((b) => ({
              category: b.category,
              monthlySpend: b.monthlySpend,
              annualValue: Math.round(b.annualValue),
            })),
          milestoneValue: Math.round(s.milestoneValue),
        };
      });
    },
  };

  const getCardDetails: ToolDefinition = {
    name: "getCardDetails",
    description:
      "Returns full details for one specific card by id — use this to compare trade-offs on the top few cards before writing your explanation.",
    parameters: {
      type: "object",
      properties: { cardId: { type: "string" } },
      required: ["cardId"],
    },
    execute: async (args: unknown) => {
      const cardId = (args as { cardId?: string })?.cardId;
      if (typeof cardId !== "string") {
        return { error: "cardId is required" };
      }
      const dbCard = ctx.dbCardsById.get(cardId);
      if (!dbCard) {
        return { error: `No card found for id ${cardId}` };
      }
      return {
        cardId: dbCard.id,
        name: dbCard.name,
        issuer: dbCard.issuer,
        network: dbCard.network,
        annualFee: dbCard.annualFee,
        joiningFee: dbCard.joiningFee,
        feeWaiverCondition: dbCard.feeWaiverCondition,
        rewardRates: dbCard.rewardRates,
        milestoneBenefits: dbCard.milestoneBenefits,
        welcomeBonus: dbCard.welcomeBonus,
        loungeAccess: dbCard.loungeAccess,
      };
    },
  };

  return [getUserProfile, scoreCards, getCardDetails];
}
