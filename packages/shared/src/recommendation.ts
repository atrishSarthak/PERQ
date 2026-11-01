import { z } from "zod";
import { categorySchema, networkSchema } from "./cards";
import { quizAnswersV2Schema } from "./quiz";

// The recommender's output (handoff §1.3 step 5), produced by
// packages/scoring-engine and returned by the API. Every ₹ here is an
// integer computed by packages/finance-engine.

export const breakdownLineSchema = z.object({
  category: categorySchema,
  label: z.string(),
  monthlySpend: z.number(), // ₹/month assumed from the quiz
  ratePct: z.number(), // % value back
  monthlyCap: z.number().nullable(), // the category's own cap
  capApplied: z.boolean(), // a category, shared or total cap reduced this line
  annualReward: z.number().int(), // ₹/yr after caps
});
export type BreakdownLine = z.infer<typeof breakdownLineSchema>;

export const feeLineSchema = z.object({
  joiningFee: z.number().int(), // incl. 18% GST
  annualFee: z.number().int(), // renewal, incl. GST, before waiver
  waiverSpend: z.number().int().nullable(),
  qualifyingSpend: z.number().int(), // your projected spend that counts toward the waiver
  waived: z.boolean(),
  payable: z.number().int(), // renewal fee you actually pay
});

export const flagsSchema = z.object({
  upi: z.boolean(),
  lifetimeFree: z.boolean(),
  fdBacked: z.boolean(),
  held: z.boolean(),
});

export const scoredCardSchema = z.object({
  rank: z.number().int(),
  cardId: z.string(),
  name: z.string(),
  issuer: z.string(),
  networks: z.array(networkSchema),
  ongoingValue: z.number().int(), // ₹/yr from year 2
  year1Value: z.number().int(), // ₹ in year 1 (joining fee + welcome benefit)
  rewards: z.number().int(), // ₹/yr from spend + milestones
  milestoneValue: z.number().int(),
  welcomeBenefit: z.number().int(),
  breakdown: z.array(breakdownLineSchema),
  fee: feeLineSchema,
  eligibilityReason: z.string(),
  flags: flagsSchema,
  reason: z.string(), // one line, template-built from the numbers above
  rewardNotes: z.string(),
  sourceUrl: z.string(),
  sourceUpdatedAt: z.string(),
  fdMinAmount: z.number().int().nullable(),
});
export type ScoredCardV2 = z.infer<typeof scoredCardSchema>;

export const ineligibleCardSchema = z.object({
  cardId: z.string(),
  name: z.string(),
  issuer: z.string(),
  reason: z.string(),
});

export const leakageSchema = z.object({
  amount: z.number().int(),
  bestCardId: z.string().nullable(),
  bestHeldCardId: z.string().nullable(),
  holdsBest: z.boolean(),
  hasCards: z.boolean(),
  message: z.string(),
});
export type LeakageResult = z.infer<typeof leakageSchema>;

export const assumptionsSchema = z.object({
  monthlySpend: z.record(categorySchema, z.number()),
  travelTripsPerYear: z.number(),
  avgTripSpend: z.number(),
  gstRatePct: z.number(),
  /** Step 2 §9: "statements" once the user switched to real spend. */
  spendSource: z.enum(["quiz", "statements"]).default("quiz"),
  statementCount: z.number().int().optional(),
  dataThrough: z.string().nullable().optional(),
});

export const recommendationResultSchema = z.object({
  ranked: z.array(scoredCardSchema),
  ineligible: z.array(ineligibleCardSchema),
  leakage: leakageSchema,
  assumptions: assumptionsSchema,
  catalogue: z.object({ total: z.number().int(), verified: z.number().int(), checkedOn: z.string() }),
});
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

/** What GET /api/recommender/results returns to the apps. */
export const resultsResponseSchema = z.object({
  answers: quizAnswersV2Schema,
  /** Step 2 §9: whether real spend from statements is available / in use. */
  spendSync: z
    .object({
      source: z.enum(["quiz", "statements"]),
      available: z.boolean(),
      statementCount: z.number().int(),
      dataThrough: z.string().nullable(),
    })
    .optional(),
  needsConfirmation: z.array(z.string()),
  result: recommendationResultSchema,
  explanation: z
    .object({ text: z.string(), source: z.enum(["gemini", "fallback_template", "cached"]), topCardId: z.string() })
    .nullable(),
  profileHash: z.string(),
});
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;
