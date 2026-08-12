import { z } from "zod";

// Mirrors packages/scoring-engine's QuizAnswers shape exactly (PRD §8's 13
// questions) — this is the request-boundary validator; the scoring-engine
// type itself has zero validation dependency (pure package, no I/O).
const spendBucket = z.enum(["<1k", "1-3k", "3-6k", "6k+"]);
const frequencyBucket = z.enum(["never", "1-2", "3-5", "6+"]);
const incomeBracket = z.enum(["under-3l", "3-6l", "6-12l", "12l+"]);
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

export const quizAnswersSchema = z.object({
  heldCardIds: z.array(z.string()),
  annualIncome: incomeBracket,
  flightFrequency: frequencyBucket,
  hotelFrequency: frequencyBucket,
  gymMembership: z.object({
    active: z.boolean(),
    monthlyCost: z.number().nullable(),
  }),
  foodDeliverySpend: spendBucket,
  ecommerceSpend: spendBucket,
  grocerySpend: spendBucket,
  diningOutSpend: spendBucket,
  fuelSpend: spendBucket,
  recurringBillsByCard: z.boolean(),
  feeTolerant: z.boolean(),
  priorityCategories: z.array(spendCategory).max(2),
});

export type ValidatedQuizAnswers = z.infer<typeof quizAnswersSchema>;
