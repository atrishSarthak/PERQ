import { z } from "zod";
import {
  quizAnswersV2Schema,
  type IncomeBucket,
  type Priority,
  type QuizAnswersV2,
  type QuizKey,
  type SpendBucket,
  type TravelBucket,
} from "./quiz";

// Old (v1, Feature 1) profiles were stored without a schemaVersion, with 13
// answers (+6 optional Feature 3 fields). This maps what can be mapped and
// lists the answers the user should confirm on next open (handoff §1.1).
// Never throws: an unreadable row becomes "start the quiz again".

const v1Spend = z.enum(["<1k", "1-3k", "3-6k", "6k+"]);
const v1Freq = z.enum(["never", "1-2", "3-5", "6+"]);
const quizAnswersV1Schema = z
  .object({
    heldCardIds: z.array(z.string()),
    annualIncome: z.enum(["under-3l", "3-6l", "6-10l", "10l+", "prefer-not-to-say"]),
    flightFrequency: v1Freq,
    hotelFrequency: v1Freq,
    foodDeliverySpend: v1Spend,
    ecommerceSpend: v1Spend,
    grocerySpend: v1Spend,
    diningOutSpend: v1Spend,
    fuelSpend: v1Spend,
    recurringBillsByCard: z.enum(["yes", "no", "some"]),
    feeTolerant: z.boolean(),
    priorityCategories: z.array(z.string()),
  })
  .passthrough();
export type QuizAnswersV1 = z.infer<typeof quizAnswersV1Schema>;

const SPEND_V1_TO_V2: Record<z.infer<typeof v1Spend>, SpendBucket> = {
  "<1k": "lt_1k",
  "1-3k": "1k_3k",
  "3-6k": "3k_6k",
  "6k+": "6k_plus",
};
const FREQ_V1_TO_V2: Record<z.infer<typeof v1Freq>, TravelBucket> = {
  never: "never",
  "1-2": "1_2",
  "3-5": "3_5",
  "6+": "6_plus",
};
const TRAVEL_ORDER: TravelBucket[] = ["never", "1_2", "3_5", "6_plus"];
// v1 asked annual income; v2 asks monthly take-home. ₹3L/yr ≈ ₹25k/month.
const INCOME_V1_TO_V2: Record<string, IncomeBucket | null> = {
  "under-3l": "below_25k",
  "3-6l": "25k_50k",
  "6-10l": "50k_1l",
  "10l+": "1l_2l",
  "prefer-not-to-say": null,
};
const PRIORITY_V1_TO_V2: Record<string, Priority | undefined> = {
  dining: "dining",
  travel: "travel",
  hotels: "travel",
  fuel: "fuel",
  ecommerce: "shopping",
};

export type NormalizedProfile =
  | { kind: "v2"; answers: QuizAnswersV2; needsConfirmation: QuizKey[] }
  | { kind: "migrated"; answers: QuizAnswersV2; needsConfirmation: QuizKey[] }
  | { kind: "invalid"; answers: null; needsConfirmation: QuizKey[] };

export function migrateV1Answers(v1: QuizAnswersV1): { answers: QuizAnswersV2; needsConfirmation: QuizKey[] } {
  const needsConfirmation: QuizKey[] = ["occupation", "monthlySpend", "openToSecured"];
  const income = INCOME_V1_TO_V2[v1.annualIncome] ?? null;
  if (!income) needsConfirmation.push("monthlyIncome");

  const flights = FREQ_V1_TO_V2[v1.flightFrequency];
  const hotels = FREQ_V1_TO_V2[v1.hotelFrequency];
  const travel = TRAVEL_ORDER[Math.max(TRAVEL_ORDER.indexOf(flights), TRAVEL_ORDER.indexOf(hotels))]!;

  const priorities = [
    ...new Set(v1.priorityCategories.map((p) => PRIORITY_V1_TO_V2[p]).filter((p): p is Priority => !!p)),
  ].slice(0, 2);

  const answers: QuizAnswersV2 = {
    schemaVersion: 2,
    cardsHeld: v1.heldCardIds,
    occupation: "salaried", // v1 never asked; confirmed on next open
    monthlyIncome: income ?? "25k_50k",
    monthlySpend: {
      food_delivery: SPEND_V1_TO_V2[v1.foodDeliverySpend],
      online_shopping: SPEND_V1_TO_V2[v1.ecommerceSpend],
      groceries: SPEND_V1_TO_V2[v1.grocerySpend],
      dining: SPEND_V1_TO_V2[v1.diningOutSpend],
      fuel: SPEND_V1_TO_V2[v1.fuelSpend],
      // v1 only asked whether bills go on a card; v1 assumed ₹1,500 for "yes".
      bills: v1.recurringBillsByCard === "yes" ? "1k_3k" : v1.recurringBillsByCard === "some" ? "lt_1k" : "0",
      upi: "0", // v1 never asked
    },
    travelPerYear: travel,
    feeTolerance: v1.feeTolerant ? "any" : "zero",
    priorities,
    openToSecured: null,
  };
  return { answers, needsConfirmation };
}

/** Reads any stored profile (v2, v1 or garbage) without throwing. */
export function normalizeStoredAnswers(raw: unknown): NormalizedProfile {
  const v2 = quizAnswersV2Schema.safeParse(raw);
  if (v2.success) return { kind: "v2", answers: v2.data, needsConfirmation: [] };
  const v1 = quizAnswersV1Schema.safeParse(raw);
  if (v1.success) return { kind: "migrated", ...migrateV1Answers(v1.data) };
  return { kind: "invalid", answers: null, needsConfirmation: [] };
}
