import { z } from "zod";

// The compiled source-data shape (PRD §7): real card research/content,
// stored as JSON and loaded via `pnpm db:seed-cards path/to/cards.json`.
// `id` is a stable, hand-assigned slug (e.g. "hdfc-regalia") — NOT a
// generated UUID — because editing a card later means editing this file
// and re-running the script (PRD §7), which only works if the same card
// keeps the same id across runs (arsenal/recommendation rows FK to it).
export const cardSourceSchema = z.object({
  id: z.string().min(1),
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
});

export const cardSourceFileSchema = z.array(cardSourceSchema);

export type CardSource = z.infer<typeof cardSourceSchema>;
