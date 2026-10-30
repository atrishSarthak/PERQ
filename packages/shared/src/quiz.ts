import { z } from "zod";
import { occupationSchema } from "./cards";

// ---------------------------------------------------------------------------
// Quiz v2 (handoff §1.1, locked): 7 questions + 1 conditional.
// Shared by web and mobile so both render the same questions and the API
// validates exactly what the apps send.
// ---------------------------------------------------------------------------

export const QUIZ_SPEND_CATEGORIES = [
  "food_delivery",
  "online_shopping",
  "groceries",
  "dining",
  "fuel",
  "bills",
  "upi",
] as const;
export type QuizSpendCategory = (typeof QUIZ_SPEND_CATEGORIES)[number];

export const spendBucketSchema = z.enum(["0", "lt_1k", "1k_3k", "3k_6k", "6k_plus"]);
export type SpendBucket = z.infer<typeof spendBucketSchema>;
export const incomeBucketSchema = z.enum(["below_25k", "25k_50k", "50k_1l", "1l_2l", "2l_plus"]);
export type IncomeBucket = z.infer<typeof incomeBucketSchema>;
export const travelBucketSchema = z.enum(["never", "1_2", "3_5", "6_plus"]);
export type TravelBucket = z.infer<typeof travelBucketSchema>;
export const feeToleranceSchema = z.enum(["zero", "upto_1000", "upto_5000", "any"]);
export type FeeTolerance = z.infer<typeof feeToleranceSchema>;
export const prioritySchema = z.enum(["cashback", "travel", "dining", "shopping", "fuel"]);
export type Priority = z.infer<typeof prioritySchema>;

export const monthlySpendAnswerSchema = z.object(
  Object.fromEntries(QUIZ_SPEND_CATEGORIES.map((c) => [c, spendBucketSchema])) as Record<
    QuizSpendCategory,
    typeof spendBucketSchema
  >
);
export type MonthlySpendAnswer = z.infer<typeof monthlySpendAnswerSchema>;

export const quizAnswersV2Schema = z.object({
  schemaVersion: z.literal(2),
  cardsHeld: z.array(z.string().min(1)).max(30), // [] = "I don't have one yet"
  occupation: occupationSchema,
  monthlyIncome: incomeBucketSchema,
  monthlySpend: monthlySpendAnswerSchema,
  travelPerYear: travelBucketSchema,
  feeTolerance: feeToleranceSchema,
  priorities: z.array(prioritySchema).max(2), // [] = "No preference"
  // Shown only when occupation = student or income < ₹25k; null otherwise.
  openToSecured: z.boolean().nullable(),
});
export type QuizAnswersV2 = z.infer<typeof quizAnswersV2Schema>;
export type QuizKey = Exclude<keyof QuizAnswersV2, "schemaVersion">;

export function shouldAskOpenToSecured(a: Pick<QuizAnswersV2, "occupation" | "monthlyIncome">): boolean {
  return a.occupation === "student" || a.monthlyIncome === "below_25k";
}

// ---------------------------------------------------------------------------
// Bucket → number mapping (handoff §1.1: lives here, shown in the breakdown)
// Midpoints of each range; open-ended top buckets use a documented value.
// ---------------------------------------------------------------------------

/** ₹ per month assumed for each spend bucket. */
export const SPEND_BUCKET_RUPEES: Record<SpendBucket, number> = {
  "0": 0,
  lt_1k: 500, // midpoint of ₹0–1k
  "1k_3k": 2000, // midpoint of ₹1–3k
  "3k_6k": 4500, // midpoint of ₹3–6k
  "6k_plus": 8000, // handoff §1.1: "₹6k+" → ₹8,000
};

/** Trips (flights or hotel stays) per year assumed for each travel bucket. */
export const TRAVEL_BUCKET_TRIPS: Record<TravelBucket, number> = {
  never: 0,
  "1_2": 1.5,
  "3_5": 4,
  "6_plus": 8,
};

/**
 * Average ₹ put on a card per trip: one domestic return flight (~₹9,000) plus
 * one night's hotel (~₹3,000). A round planning number, shown to the user in
 * the breakdown so they can see what was assumed.
 */
export const AVG_TRIP_SPEND = 12000;

/** ₹ per month of travel spend implied by the travel answer (unrounded). */
export function travelMonthlySpend(bucket: TravelBucket): number {
  return (TRAVEL_BUCKET_TRIPS[bucket] * AVG_TRIP_SPEND) / 12;
}

/**
 * Take-home ₹ per month for each income bucket. `floor` is used for
 * eligibility (a card's minimum income must be met by the bottom of your
 * range); `mid` is only for display.
 */
export const INCOME_BUCKET_RUPEES: Record<IncomeBucket, { floor: number; mid: number }> = {
  below_25k: { floor: 0, mid: 15000 },
  "25k_50k": { floor: 25000, mid: 37500 },
  "50k_1l": { floor: 50000, mid: 75000 },
  "1l_2l": { floor: 100000, mid: 150000 },
  "2l_plus": { floor: 200000, mid: 250000 },
};

/** Highest annual fee (before GST) the user accepts; null = any if worth it. */
export const FEE_TOLERANCE_MAX: Record<FeeTolerance, number | null> = {
  zero: 0,
  upto_1000: 1000,
  upto_5000: 5000,
  any: null,
};

// ---------------------------------------------------------------------------
// Question copy, shared by the mobile and web quiz UIs.
// ---------------------------------------------------------------------------

export interface QuizOption<V extends string> {
  value: V;
  label: string;
}

export const OCCUPATION_OPTIONS: QuizOption<QuizAnswersV2["occupation"]>[] = [
  { value: "student", label: "Student" },
  { value: "salaried", label: "Salaried" },
  { value: "self_employed", label: "Self-employed" },
];
export const INCOME_OPTIONS: QuizOption<IncomeBucket>[] = [
  { value: "below_25k", label: "Below ₹25k" },
  { value: "25k_50k", label: "₹25–50k" },
  { value: "50k_1l", label: "₹50k–1L" },
  { value: "1l_2l", label: "₹1–2L" },
  { value: "2l_plus", label: "₹2L+" },
];
export const SPEND_OPTIONS: QuizOption<SpendBucket>[] = [
  { value: "0", label: "₹0" },
  { value: "lt_1k", label: "<₹1k" },
  { value: "1k_3k", label: "₹1–3k" },
  { value: "3k_6k", label: "₹3–6k" },
  { value: "6k_plus", label: "₹6k+" },
];
export const SPEND_CATEGORY_QUESTIONS: { key: QuizSpendCategory; label: string }[] = [
  { key: "food_delivery", label: "Food delivery" },
  { key: "online_shopping", label: "Online shopping" },
  { key: "groceries", label: "Groceries" },
  { key: "dining", label: "Dining out" },
  { key: "fuel", label: "Fuel" },
  { key: "bills", label: "Bills & subscriptions" },
  { key: "upi", label: "UPI scan-and-pay" },
];
export const TRAVEL_OPTIONS: QuizOption<TravelBucket>[] = [
  { value: "never", label: "Never" },
  { value: "1_2", label: "1–2" },
  { value: "3_5", label: "3–5" },
  { value: "6_plus", label: "6+" },
];
export const FEE_OPTIONS: QuizOption<FeeTolerance>[] = [
  { value: "zero", label: "₹0 only" },
  { value: "upto_1000", label: "Up to ₹1,000" },
  { value: "upto_5000", label: "Up to ₹5,000" },
  { value: "any", label: "Any, if it's worth it" },
];
export const PRIORITY_OPTIONS: QuizOption<Priority>[] = [
  { value: "cashback", label: "Cashback" },
  { value: "travel", label: "Travel & lounges" },
  { value: "dining", label: "Dining" },
  { value: "shopping", label: "Shopping" },
  { value: "fuel", label: "Fuel" },
];

export const QUIZ_QUESTIONS: { key: QuizKey; title: string; hint?: string }[] = [
  { key: "cardsHeld", title: "Which credit cards do you have?", hint: "Pick all that apply." },
  { key: "occupation", title: "What do you do?" },
  { key: "monthlyIncome", title: "Your monthly income", hint: "Take-home is fine." },
  { key: "monthlySpend", title: "Roughly how much do you spend a month on…" },
  { key: "travelPerYear", title: "Flights or hotel stays per year?" },
  { key: "feeTolerance", title: "Annual fee you're OK with if rewards beat it" },
  { key: "priorities", title: "What matters most?", hint: "Pick up to 2, or none." },
  { key: "openToSecured", title: "Would you consider a card backed by a fixed deposit?", hint: "Your FD keeps earning interest; the card's limit is set by it." },
];
