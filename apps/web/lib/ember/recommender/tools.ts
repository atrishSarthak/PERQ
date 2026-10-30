import { z } from "zod";
import { PERMISSION, type EmberTool } from "@perq/ai";
import { recommend } from "@perq/scoring-engine";
import {
  quizAnswersV2Schema,
  QUIZ_SPEND_CATEGORIES,
  spendBucketSchema,
  travelBucketSchema,
  feeToleranceSchema,
  type CatalogCard,
  type QuizAnswersV2,
  type RecommendationResult,
  type ScoredCardV2,
  type SpendBucket,
} from "@perq/shared";

// Ember's recommender tools (handoff §1.4). All level 1: they read or
// compute, never change anything. Every number they return comes from
// recommend() → packages/finance-engine; Gemini only reads them.

export interface RecommenderToolContext {
  answers: QuizAnswersV2;
  result: RecommendationResult;
  catalogue: CatalogCard[];
  heldCardIds: string[];
}

const TOP_N = 8;

function summary(c: ScoredCardV2) {
  return {
    rank: c.rank,
    cardId: c.cardId,
    name: c.name,
    issuer: c.issuer,
    ongoingValuePerYear: c.ongoingValue,
    year1Value: c.year1Value,
    renewalFeePayable: c.fee.payable,
    renewalFeeBeforeWaiver: c.fee.annualFee,
    joiningFee: c.fee.joiningFee,
    feeWaived: c.fee.waived,
    feeWaiverSpend: c.fee.waiverSpend,
    topCategories: [...c.breakdown]
      .filter((b) => b.annualReward > 0)
      .sort((a, b) => b.annualReward - a.annualReward)
      .slice(0, 3)
      .map((b) => ({ category: b.label, ratePct: b.ratePct, rewardPerYear: b.annualReward, capped: b.capApplied })),
    flags: c.flags,
  };
}

function detail(c: ScoredCardV2) {
  return {
    ...summary(c),
    breakdown: c.breakdown
      .filter((b) => b.monthlySpend > 0 || b.annualReward > 0)
      .map((b) => ({
        category: b.label,
        yourMonthlySpend: b.monthlySpend,
        ratePct: b.ratePct,
        monthlyCap: b.monthlyCap,
        capApplied: b.capApplied,
        rewardPerYear: b.annualReward,
      })),
    milestoneValuePerYear: c.milestoneValue,
    welcomeBenefitYear1: c.welcomeBenefit,
    eligibility: c.eligibilityReason,
    termsNotes: c.rewardNotes,
    termsCheckedOn: c.sourceUpdatedAt,
    source: c.sourceUrl,
  };
}

/** Looks a card up by id or (fuzzy) name, so "why not the Amazon card?" works. */
export function findCard(catalogue: CatalogCard[], idOrName: string): CatalogCard | undefined {
  const q = idOrName.trim().toLowerCase();
  const loose = q.replace(/[_-]+/g, " ");
  const words = loose.split(/\s+/).filter((w) => w.length > 2);
  return (
    catalogue.find((c) => c.id === q) ??
    catalogue.find((c) => c.name.toLowerCase() === q) ??
    catalogue.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) ??
    catalogue.find((c) => c.id === loose.replace(/\s+/g, "-")) ??
    catalogue.find((c) => words.length > 0 && words.every((w) => `${c.id} ${c.name} ${c.issuer}`.toLowerCase().replace(/-/g, " ").includes(w)))
  );
}

function cardStatus(ctx: RecommenderToolContext, idOrName: string) {
  const card = findCard(ctx.catalogue, idOrName);
  if (!card) return { found: false as const, message: `No card matching "${idOrName}" in PERQ's catalogue.` };
  const scored = ctx.result.ranked.find((c) => c.cardId === card.id);
  if (scored) return { found: true as const, card, scored };
  const ineligible = ctx.result.ineligible.find((c) => c.cardId === card.id);
  return {
    found: true as const,
    card,
    scored: null,
    whyNotRanked: !card.verified
      ? "PERQ hasn't been able to verify this card's terms on the bank's own page yet, so it isn't ranked."
      : (ineligible?.reason ?? "Not ranked for this profile."),
    termsNotes: card.rewardNotes,
  };
}

/** ₹ amount → the quiz bucket whose assumed value is closest (for what-ifs). */
export function bucketForRupees(rupees: number): SpendBucket {
  if (rupees <= 0) return "0";
  if (rupees < 1000) return "lt_1k";
  if (rupees < 3000) return "1k_3k";
  if (rupees < 6000) return "3k_6k";
  return "6k_plus";
}

const spendChange = z
  .object(
    Object.fromEntries(QUIZ_SPEND_CATEGORIES.map((c) => [c, z.number().int().nonnegative().optional()])) as Record<
      (typeof QUIZ_SPEND_CATEGORIES)[number],
      z.ZodOptional<z.ZodNumber>
    >
  )
  .describe("Monthly ₹ spend per category to try, e.g. { dining: 5000 }");

export function createRecommenderTools(ctx: RecommenderToolContext): EmberTool<any, any>[] {
  const getUserProfile: EmberTool<Record<string, never>, unknown> = {
    name: "getUserProfile",
    description: "The user's quiz answers and the ₹/month PERQ assumed for each spend category.",
    input: z.object({}),
    permission: PERMISSION.OBSERVE,
    narration: "Checked your answers",
    handler: async () => ({
      occupation: ctx.answers.occupation,
      monthlyIncome: ctx.answers.monthlyIncome,
      feeTolerance: ctx.answers.feeTolerance,
      priorities: ctx.answers.priorities,
      travelPerYear: ctx.answers.travelPerYear,
      assumedMonthlySpend: ctx.result.assumptions.monthlySpend,
      cardsHeld: ctx.heldCardIds.map((id) => ctx.catalogue.find((c) => c.id === id)?.name ?? id),
      openToSecured: ctx.answers.openToSecured,
    }),
  };

  const scoreCards: EmberTool<Record<string, never>, unknown> = {
    name: "scoreCards",
    description:
      "Ranked cards for this user with ₹ per year (ongoing and year 1), fees and top reward categories, plus leakage. All numbers are final; never change or recompute them.",
    input: z.object({}),
    permission: PERMISSION.OBSERVE,
    narration: (_i, o) => {
      const out = o as { cardsConsidered: number; eligibleCount: number };
      return `Filtered ${out.cardsConsidered} cards to the ${out.eligibleCount} you can get`;
    },
    handler: async () => ({
      cardsConsidered: ctx.result.catalogue.total,
      verifiedCards: ctx.result.catalogue.verified,
      eligibleCount: ctx.result.ranked.length,
      topPick: ctx.result.ranked[0] ? summary(ctx.result.ranked[0]) : null,
      ranked: ctx.result.ranked.slice(0, TOP_N).map(summary),
      leakage: ctx.result.leakage,
    }),
  };

  const getCardDetails: EmberTool<{ cardId: string }, unknown> = {
    name: "getCardDetails",
    description:
      "Full breakdown for one card by id or name: per-category spend, rate, caps, ₹ per year, fee and waiver, eligibility and terms notes. If the card isn't ranked, says why.",
    input: z.object({ cardId: z.string().min(1).describe("Card id or name") }),
    permission: PERMISSION.OBSERVE,
    narration: (i) => {
      const card = findCard(ctx.catalogue, i.cardId);
      return card ? `Looked closer at ${card.name}` : "Looked up a card";
    },
    handler: async ({ cardId }) => {
      const s = cardStatus(ctx, cardId);
      if (!s.found) return s;
      return s.scored
        ? { found: true, ranked: true, ...detail(s.scored) }
        : { found: true, ranked: false, name: s.card.name, issuer: s.card.issuer, whyNotRanked: s.whyNotRanked, termsNotes: s.termsNotes };
    },
  };

  const compareCards: EmberTool<{ cardIdA: string; cardIdB: string }, unknown> = {
    name: "compareCards",
    description: "Side-by-side ₹ breakdown of two cards for this user, with the differences already computed.",
    input: z.object({ cardIdA: z.string().min(1), cardIdB: z.string().min(1) }),
    permission: PERMISSION.OBSERVE,
    narration: (i) => {
      const a = findCard(ctx.catalogue, i.cardIdA)?.name;
      const b = findCard(ctx.catalogue, i.cardIdB)?.name;
      return a && b ? `Compared ${a} with ${b}` : "Compared two cards";
    },
    handler: async ({ cardIdA, cardIdB }) => {
      const a = cardStatus(ctx, cardIdA);
      const b = cardStatus(ctx, cardIdB);
      if (!a.found || !b.found || !a.scored || !b.scored) {
        return {
          comparable: false,
          a: a.found ? (a.scored ? summary(a.scored) : { name: a.card.name, whyNotRanked: a.whyNotRanked }) : a,
          b: b.found ? (b.scored ? summary(b.scored) : { name: b.card.name, whyNotRanked: b.whyNotRanked }) : b,
        };
      }
      const perCategory = a.scored.breakdown
        .map((line) => {
          const other = b.scored!.breakdown.find((x) => x.category === line.category)!;
          return {
            category: line.label,
            yourMonthlySpend: line.monthlySpend,
            [a.scored!.name]: line.annualReward,
            [b.scored!.name]: other.annualReward,
            difference: line.annualReward - other.annualReward,
          };
        })
        .filter((r) => r.difference !== 0);
      return {
        comparable: true,
        a: detail(a.scored),
        b: detail(b.scored),
        ongoingDifferencePerYear: a.scored.ongoingValue - b.scored.ongoingValue,
        year1Difference: a.scored.year1Value - b.scored.year1Value,
        perCategoryDifference: perCategory,
      };
    },
  };

  const whatIf: EmberTool<
    { monthlySpend?: Partial<Record<string, number>>; travelPerYear?: string; feeTolerance?: string },
    unknown
  > = {
    name: "whatIf",
    description:
      "Re-scores with temporary changes (nothing is saved), e.g. 'what if I spent ₹5,000 on dining' or 'what if I travel more'. Spend amounts are mapped to the quiz's buckets; the output says which ₹ value was assumed.",
    input: z.object({
      monthlySpend: spendChange.optional(),
      travelPerYear: travelBucketSchema.optional().describe("never | 1_2 | 3_5 | 6_plus"),
      feeTolerance: feeToleranceSchema.optional().describe("zero | upto_1000 | upto_5000 | any"),
    }),
    permission: PERMISSION.OBSERVE,
    narration: "Re-ran the numbers with your change",
    handler: async (change) => {
      const spend = { ...ctx.answers.monthlySpend };
      for (const [k, v] of Object.entries(change.monthlySpend ?? {})) {
        if (typeof v === "number") spend[k as keyof typeof spend] = spendBucketSchema.parse(bucketForRupees(v));
      }
      const answers = quizAnswersV2Schema.parse({
        ...ctx.answers,
        monthlySpend: spend,
        travelPerYear: change.travelPerYear ?? ctx.answers.travelPerYear,
        feeTolerance: change.feeTolerance ?? ctx.answers.feeTolerance,
      });
      const next = recommend(answers, ctx.catalogue, { heldCardIds: ctx.heldCardIds });
      const before = ctx.result.ranked[0];
      const after = next.ranked[0];
      return {
        saved: false,
        assumedMonthlySpend: next.assumptions.monthlySpend,
        topPickBefore: before ? { name: before.name, ongoingValuePerYear: before.ongoingValue } : null,
        topPickAfter: after ? { name: after.name, ongoingValuePerYear: after.ongoingValue } : null,
        topPickChanged: before?.cardId !== after?.cardId,
        rankedAfter: next.ranked.slice(0, 5).map(summary),
        leakageAfter: next.leakage,
      };
    },
  };

  return [getUserProfile, scoreCards, getCardDetails, compareCards, whatIf];
}
