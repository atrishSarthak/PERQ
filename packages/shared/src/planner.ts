import { z } from "zod";
import { networkSchema } from "./cards";
import { txnCategorySchema } from "./money";

// Step 3 Purchase Planner (handoff §5, §9). These schemas are the single
// source of truth for the planner's shapes: finance-engine imports the types
// (type-only), the web API validates with them, and the Chrome extension's
// /api/extension/analyze will reuse rankPaymentOptions / emiTrueCost with
// the same input and output schemas.
//
// Money is integer rupees. Dates are YYYY-MM-DD calendar days in IST, so
// everything crosses JSON and SSE unchanged.

const rupees = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---- inputs (§5.1–5.4) --------------------------------------------------------

export const OFFER_TYPES = ["instant_discount", "cashback", "no_cost_emi", "coupon"] as const;

export const offerSpecSchema = z
  .object({
    type: z.enum(OFFER_TYPES),
    // Who qualifies. Matching is conservative: unknown means not eligible.
    bank: z.string().trim().min(1).max(60).optional(),
    network: networkSchema.optional(),
    cardNames: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
    percent: z.number().positive().max(100).optional(),
    flat: rupees.optional(),
    minOrder: rupees.optional(),
    maxDiscount: rupees.optional(),
    emiOnly: z.boolean().optional(),
    rawText: z.string().trim().min(1).max(300),
  })
  .refine((o) => o.type === "no_cost_emi" || o.percent !== undefined || o.flat !== undefined, {
    message: "An offer needs a percent or a flat amount",
    path: ["percent"],
  });
export type OfferSpec = z.infer<typeof offerSpecSchema>;

export const emiSpecSchema = z
  .object({
    tenureMonths: z.number().int().min(1).max(60),
    interestRatePa: z.number().min(0).max(60).optional(), // % per year, regular EMI
    noCost: z.boolean().optional(), // interest offset by an upfront discount
    processingFee: rupees.optional(), // ₹, before GST
    bankName: z.string().trim().min(1).max(60).optional(),
  })
  .refine((e) => e.noCost === true || e.interestRatePa !== undefined, {
    message: "An EMI needs an interest rate or to be no-cost",
    path: ["interestRatePa"],
  });
export type EmiSpec = z.infer<typeof emiSpecSchema>;

export const planInputSchema = z.object({
  item: z.object({ name: z.string().trim().min(1).max(120), category: txnCategorySchema }),
  price: z.number().int().min(1).max(10_000_000),
  merchant: z.string().trim().min(1).max(80).optional(),
  needBy: isoDate.optional(), // latest acceptable purchase day
  offers: z.array(offerSpecSchema).max(5).default([]),
  emiOptions: z.array(emiSpecSchema).max(5).default([]),
});
export type PlanInput = z.infer<typeof planInputSchema>;

/** What extraction returns before the user confirms (§2: never plan on these). */
export const partialPlanInputSchema = z.object({
  item: z.object({ name: z.string().max(120).optional(), category: txnCategorySchema.optional() }).optional(),
  price: z.number().int().positive().optional(),
  merchant: z.string().max(80).optional(),
  needBy: isoDate.optional(),
  offers: z.array(offerSpecSchema).max(5).default([]),
  emiOptions: z.array(emiSpecSchema).max(5).default([]),
});
export type PartialPlanInput = z.infer<typeof partialPlanInputSchema>;

export const planSourceSchema = z.enum(["typed", "chat", "screenshot", "link"]);
export type PlanSource = z.infer<typeof planSourceSchema>;

export const planStatusSchema = z.enum(["draft", "planned", "reminder_set", "bought", "dropped", "expired"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

// ---- outputs (§5.4–5.7) -------------------------------------------------------

const line = z.object({ label: z.string(), amount: z.number().int() });

export const emiTrueCostSchema = z.object({
  tenureMonths: z.number().int(),
  noCost: z.boolean(),
  monthlyInstalment: rupees,
  totalInterest: rupees, // interest charged by the bank over the tenure
  upfrontDiscount: rupees, // no-cost EMI: the discount that offsets the interest
  gstOnInterest: rupees,
  processingFeeWithGst: rupees,
  rewardsLost: rupees,
  /** What the EMI costs on top of paying the same price in full. */
  extraCostVsFullPayment: z.number().int(),
  /** Price blocked on the card limit at purchase, released as instalments are paid. */
  blockedLimit: rupees,
  /** No-cost EMI without a printed rate: the rate the engine assumed (% p.a.), else null. */
  assumedRatePa: z.number().nullable(),
  lines: z.array(line),
});
export type EmiTrueCost = z.infer<typeof emiTrueCostSchema>;

/** Short machine codes on an option; the app and Ember turn them into words. */
export const OPTION_FLAGS = [
  "util_over_30",
  "util_over_70",
  "util_blocked",
  "over_limit",
  "rewards_lost_on_emi",
  "no_card_terms",
  "no_statement_dates",
  "no_credit_limit",
  "unreconciled",
] as const;
export const optionFlagSchema = z.enum(OPTION_FLAGS);
export type OptionFlag = z.infer<typeof optionFlagSchema>;

export const optionResultSchema = z.object({
  /** Stable id: card:<acct>:today | card:<acct>:best | emi:<acct>:<i> | upi */
  id: z.string(),
  kind: z.enum(["card_full", "card_emi", "upi"]),
  cardAccountId: z.string().nullable(),
  catalogueCardId: z.string().nullable(),
  label: z.string(),
  purchaseDate: isoDate,
  stickerPrice: rupees,
  offerDiscount: rupees,
  effectivePrice: rupees,
  rewards: rupees,
  extraCosts: rupees,
  /** effectivePrice − rewards + extraCosts */
  netCost: z.number().int(),
  /** UPI's net cost − this option's (positive = cheaper than UPI). */
  savingVsUpi: z.number().int(),
  offersApplied: z.array(z.object({ rawText: z.string(), discount: rupees })),
  offersSkipped: z.array(z.object({ rawText: z.string(), reason: z.string() })),
  interestFreeDays: z.number().int().nullable(),
  billedOn: isoDate.nullable(), // statement the purchase lands on
  dueOn: isoDate.nullable(),
  utilisationAfterPct: z.number().nullable(),
  /** Over 90% or over the limit: listed, never ranked first. */
  blocked: z.boolean(),
  flags: z.array(optionFlagSchema),
  emi: emiTrueCostSchema.optional(),
  rank: z.number().int().positive(),
});
export type OptionResult = z.infer<typeof optionResultSchema>;

export const VERDICTS = ["go", "go_with_timing", "wait", "rethink_payment"] as const;
export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

/** User-facing labels (§5.7). Never "Don't buy this". `{date}` is filled by the caller. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  go: "Go ahead",
  go_with_timing: "Go ahead, on {date}",
  wait: "Better to wait",
  rethink_payment: "Pay a different way",
};

/** Which verdict rule fired, in the Locked order of §5.7. */
export const VERDICT_REASONS = [
  "costly_payment", // rethink_payment: chosen/default pay has extra cost ≥ ₹500 and a cheaper option exists
  "all_cards_high_util", // rethink_payment: every card option > 70%
  "over_budget", // wait: price > left this month by 25%+, no need-by within 14 days
  "goal_slip", // wait: a goal slips by more than a month
  "timing_gain", // go_with_timing: ≥ 10 extra interest-free days
  "default", // go
] as const;
export const verdictReasonSchema = z.enum(VERDICT_REASONS);
export type VerdictReason = z.infer<typeof verdictReasonSchema>;

export const affordabilitySchema = z.object({
  leftThisMonth: z.number().int().nullable(),
  afterPurchase: z.number().int().nullable(),
  neededByDate: isoDate.nullable(), // credit options: when the money is needed
  neededAmount: rupees.nullable(),
  sizeLabel: z.enum(["small", "medium", "large", "unknown"]),
  goalImpacts: z.array(z.object({ goalId: z.string(), name: z.string(), monthsSlip: z.number() })),
  basis: z.enum(["budget", "income_estimate", "none"]),
  /** The monthly income band midpoint used for the size label and fallback, when known. */
  monthlyIncome: rupees.nullable(),
});
export type Affordability = z.infer<typeof affordabilitySchema>;

export const planResultSchema = z.object({
  verdict: verdictSchema,
  verdictReason: verdictReasonSchema,
  headline: z.string(),
  recommended: optionResultSchema,
  options: z.array(optionResultSchema).min(1),
  affordability: affordabilitySchema,
  timing: z
    .object({
      cardAccountId: z.string(),
      bestDate: isoDate,
      floatToday: z.number().int(),
      floatBest: z.number().int(),
      extraDays: z.number().int(),
    })
    .optional(),
  credit: z
    .object({
      cardAccountId: z.string(),
      before: z.number().nullable(),
      after: z.number().nullable(),
      payToStayUnder30: rupees.nullable(),
      nextStatementDate: isoDate.nullable(),
    })
    .optional(),
  emi: emiTrueCostSchema.optional(),
  /** Named out loud (§2): e.g. "no statements yet", "no budget set". */
  missingData: z.array(z.string()),
  assumptions: z.array(z.string()),
  asOf: isoDate,
  engineVersion: z.number().int(),
});
export type PlanResult = z.infer<typeof planResultSchema>;

// ---- API (§9) -----------------------------------------------------------------

export const planExtractRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    imageBase64: z.string().min(100).max(8_000_000), // ~6 MB image
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  }),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(1000) }),
]);
export type PlanExtractRequest = z.infer<typeof planExtractRequestSchema>;

export const planExtractResponseSchema = z.object({
  draft: partialPlanInputSchema,
  missing: z.array(z.enum(["price", "item"])),
  notes: z.array(z.string()),
  source: planSourceSchema,
});
export type PlanExtractResponse = z.infer<typeof planExtractResponseSchema>;

export const planRunRequestSchema = z.object({ input: planInputSchema, source: planSourceSchema });
export type PlanRunRequest = z.infer<typeof planRunRequestSchema>;

export const planWhatIfRequestSchema = z.object({
  changes: z
    .object({
      price: z.number().int().min(1).max(10_000_000).optional(),
      cardAccountId: z.string().optional(),
      purchaseDate: isoDate.optional(),
      emiTenure: z.number().int().min(1).max(60).optional(),
      needBy: isoDate.nullable().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, "Change at least one thing"),
});
export type PlanWhatIfRequest = z.infer<typeof planWhatIfRequestSchema>;

export const planPatchSchema = z
  .object({
    status: planStatusSchema.optional(),
    remindAt: isoDate.nullable().optional(),
    needBy: isoDate.nullable().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type PlanPatch = z.infer<typeof planPatchSchema>;

export const planSummarySchema = z.object({
  id: z.string(),
  itemName: z.string(),
  category: z.string(),
  price: z.number().int(),
  merchant: z.string().nullable(),
  verdict: verdictSchema.nullable(),
  status: planStatusSchema,
  remindAt: isoDate.nullable(),
  needByDate: isoDate.nullable(),
  recommendedLabel: z.string().nullable(),
  createdAt: z.string(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;
export const planListResponseSchema = z.object({ plans: z.array(planSummarySchema) });

export const planDetailResponseSchema = z.object({
  plan: planSummarySchema.extend({
    source: planSourceSchema,
    input: planInputSchema,
    result: planResultSchema.nullable(),
    explanation: z.string().nullable(),
    explanationSource: z.enum(["ai", "template"]).nullable(),
  }),
  matchedTransaction: z
    .object({ id: z.string(), date: isoDate, merchant: z.string(), amount: z.number(), cardLabel: z.string() })
    .nullable(),
});
export type PlanDetailResponse = z.infer<typeof planDetailResponseSchema>;

export const planWhatIfResponseSchema = z.object({ result: planResultSchema, explanation: z.string() });
export type PlanWhatIfResponse = z.infer<typeof planWhatIfResponseSchema>;
