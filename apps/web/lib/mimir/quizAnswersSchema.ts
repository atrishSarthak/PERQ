import { z } from "zod";

// Mirrors packages/scoring-engine's QuizAnswers shape exactly (PRD §8's 13
// questions) — this is the request-boundary validator; the scoring-engine
// type itself has zero validation dependency (pure package, no I/O).
const spendBucket = z.enum(["<1k", "1-3k", "3-6k", "6k+"]);
const frequencyBucket = z.enum(["never", "1-2", "3-5", "6+"]);
const incomeBracket = z.enum(["under-3l", "3-6l", "6-10l", "10l+", "prefer-not-to-say"]);
const gymMembershipBucket = z.enum(["none", "under-1500", "1500-plus"]);
const recurringBillsAnswer = z.enum(["yes", "no", "some"]);
const spendCategory = z.enum([
  "dining",
  "travel",
  "hotels",
  "fuel",
  "groceries",
  "ecommerce",
  "utilities",
  "general",
]);

// Feature 3 Engineering Plan §11 / 2B: the 6 new financial-context/billing-
// cycle fields join the existing 13 as more keys on this SAME object rather
// than a separate schema/table — apps/web/lib/mimir/profileFieldSchema.ts
// derives its editable-field list generically from this schema's shape, so
// PATCH /api/profile supports editing any of these 6 with zero endpoint
// code changes. All nullable/optional: a user who hasn't filled these in
// yet (new user, or one who skipped them) must not break scoring — D1's
// scorePaymentOptions is required to skip billing-cycle reasoning rather
// than crash when they're absent.
const creditScoreRange = z.enum(["below-650", "650-750", "750-plus", "unknown"]);

export const quizAnswersSchema = z.object({
  heldCardIds: z.array(z.string()),
  annualIncome: incomeBracket,
  flightFrequency: frequencyBucket,
  hotelFrequency: frequencyBucket,
  gymMembership: gymMembershipBucket,
  foodDeliverySpend: spendBucket,
  ecommerceSpend: spendBucket,
  grocerySpend: spendBucket,
  diningOutSpend: spendBucket,
  fuelSpend: spendBucket,
  recurringBillsByCard: recurringBillsAnswer,
  feeTolerant: z.boolean(),
  priorityCategories: z.array(spendCategory).max(2),
  // Feature 3 §11 (6 new fields, all self-reported, all optional — a fresh
  // user's profile predates these questions entirely):
  creditScoreRange: creditScoreRange.nullable().optional(),
  activeEmiCount: z.enum(["0", "1", "2", "3-plus"]).nullable().optional(),
  // Day-of-month, 1-31 — the day a card's statement closes / payment is due.
  // Intentionally a single pair of fields (not per-card) at MVP scope; the
  // PRD frames this as one financial-context profile, not a per-card ledger.
  statementDate: z.number().int().min(1).max(31).nullable().optional(),
  paymentDueDate: z.number().int().min(1).max(31).nullable().optional(),
  outstandingBalance: z.number().nonnegative().nullable().optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
});

export type ValidatedQuizAnswers = z.infer<typeof quizAnswersSchema>;
