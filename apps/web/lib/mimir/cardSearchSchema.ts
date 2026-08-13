import { z } from "zod";

// D15: the structured shape a web-searched card must be extracted into.
// Deliberately mirrors packages/db/scripts/cardSourceSchema.ts's fields (the
// seed-file shape) so both origins map through the same downstream code —
// the one addition is sourceUrls, required so no web-sourced fact reaches
// scoring ungrounded (validated further at the call site against the real
// citation set returned by the grounded search, not just "non-empty").
export const cardSearchResultSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  network: z.enum(["Visa", "Mastercard", "RuPay", "Amex"]),
  tier: z.string().nullable().optional(),
  joiningFee: z.number().nonnegative(),
  annualFee: z.number().nonnegative(),
  feeWaiverCondition: z.string().nullable().optional(),
  rewardRates: z.record(z.string(), z.number()),
  milestoneBenefits: z
    .array(z.object({ spendThreshold: z.number(), bonusValue: z.number() }))
    .default([]),
  welcomeBonus: z.string().nullable().optional(),
  loungeAccess: z.record(z.string(), z.unknown()).nullable().optional(),
  forexMarkupPct: z.number().nullable().optional(),
  redemptionValue: z.number().nullable().optional(),
  minIncomeEligibility: z.number().nullable().optional(),
  coBrandPartner: z.string().nullable().optional(),
  sourceUrls: z.array(z.string()).min(1),
});

export const cardSearchResultArraySchema = z.array(cardSearchResultSchema);

export type CardSearchResult = z.infer<typeof cardSearchResultSchema>;
