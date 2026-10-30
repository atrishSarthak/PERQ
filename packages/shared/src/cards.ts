import { z } from "zod";

// The v2 card catalogue shape (handoff §1.2), shared by:
// - packages/db's seed script (validates data/cards.json),
// - apps/web's API (/api/cards, recommender responses),
// - packages/scoring-engine (maps it to a finance-engine FinanceCard).

export const CATEGORY_KEYS = [
  "food_delivery",
  "online_shopping",
  "groceries",
  "dining",
  "fuel",
  "bills",
  "upi",
  "travel",
  "other",
] as const;
export const categorySchema = z.enum(CATEGORY_KEYS);
export type CategoryKey = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  food_delivery: "Food delivery",
  online_shopping: "Online shopping",
  groceries: "Groceries",
  dining: "Dining out",
  fuel: "Fuel",
  bills: "Bills & subscriptions",
  upi: "UPI scan-and-pay",
  travel: "Travel",
  other: "Everything else",
};

export const networkSchema = z.enum(["Visa", "Mastercard", "RuPay", "Amex"]);
export const occupationSchema = z.enum(["student", "salaried", "self_employed"]);
export type Occupation = z.infer<typeof occupationSchema>;
export const cardBucketSchema = z.enum([
  "secured",
  "lifetime_free",
  "entry_cashback",
  "rupay_upi",
  "mid_tier",
]);

const rupees = z.number().int().nonnegative();

export const catalogCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  issuer: z.string().min(1),
  networks: z.array(networkSchema).min(1),
  bucket: cardBucketSchema,
  tier: z.string().nullable(),
  cardType: z.enum(["secured", "unsecured"]),
  fdMinAmount: rupees.nullable(),
  lifetimeFree: z.boolean(),
  upiEnabled: z.boolean(),
  joiningFee: rupees,
  annualFee: rupees,
  feeWaiverSpend: rupees.nullable(),
  waiverExcludes: z.array(categorySchema),
  rewardRates: z.record(categorySchema, z.number().min(0).max(100)),
  rewardCaps: z.record(z.union([categorySchema, z.literal("total")]), z.number().nonnegative().nullable()),
  capGroups: z.array(
    z.object({
      categories: z.array(categorySchema).min(1),
      monthlyCap: z.number().nonnegative(),
      label: z.string().optional(),
    })
  ),
  rewardNotes: z.string(),
  milestones: z.array(z.object({ annualSpend: rupees, value: rupees })),
  welcomeBenefitValue: rupees,
  redemptionValue: z.number().nonnegative().nullable(),
  coBrandPartner: z.string().nullable(),
  minAge: z.number().int().nullable(),
  eligibleOccupations: z.array(occupationSchema).nullable(),
  minMonthlyIncome: rupees.nullable(),
  sourceUrl: z.string().url(),
  sourceUpdatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  verified: z.boolean(),
});
export type CatalogCard = z.infer<typeof catalogCardSchema>;

export const catalogFileSchema = z
  .array(catalogCardSchema)
  .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, "card ids must be unique");

/** Light card shape for the quiz's card picker (GET /api/cards). */
export const cardSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  networks: z.array(networkSchema),
  verified: z.boolean(),
});
export type CardSummary = z.infer<typeof cardSummarySchema>;
export const cardListResponseSchema = z.object({ cards: z.array(cardSummarySchema) });
