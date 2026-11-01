import type { CardTerms } from "../state";

// Planner types (Step 3 §5). The shapes that cross the API live as zod in
// packages/shared and are imported here as TYPES ONLY, so finance-engine stays
// free of runtime dependencies. Engine-only shapes are defined below.
export type {
  OfferSpec,
  EmiSpec,
  PlanInput,
  OptionResult,
  OptionFlag,
  EmiTrueCost,
  PlanResult,
  Verdict,
  VerdictReason,
  Affordability,
} from "@perq/shared";

/** Card terms the planner needs beyond the state's CardTerms. */
export interface PlanCardTerms extends CardTerms {
  issuer: string;
  networks: string[];
  /** Monthly ₹ reward caps, per reward category and "total". */
  rewardCaps: Partial<Record<string, number | null>>;
  capGroups: { categories: string[]; monthlyCap: number }[];
  emiRewards: boolean;
}

/** A held card account as the planner sees it. */
export interface PlanCard {
  /** null for a card the user holds (Step 1 quiz) but hasn't added a statement for. */
  cardAccountId: string | null;
  label: string;
  issuer: string;
  /** null when the account isn't linked to a catalogue card. */
  terms: PlanCardTerms | null;
  statementDay: number | null; // 1–31
  dueDay: number | null; // 1–31
  creditLimit: number | null;
  /** Balance basis for utilisation (§5.6): newer override, else last statement, 0 if marked paid. */
  balance: number | null;
  hasUnreconciled: boolean;
  /** This IST month's purchase spend on this card, by reward category (for remaining caps). */
  monthSpendByCategory: Partial<Record<string, number>>;
}

/** Everything the planner reads about the user, assembled by the caller (web API, extension). */
export interface PlanContext {
  today: string; // IST day
  cards: PlanCard[];
  /** This month's left-to-spend from the budget, null when there's no budget. */
  leftToSpend: number | null;
  /** The monthly budget total, for a purchase dated in a later month (a what-if "wait a month"). */
  monthBudget?: number | null;
  monthSpend: number; // this month's spend so far (statements only)
  goals: { id: string; name: string; monthlyNeeded: number | null }[];
  /** Quiz income band midpoint, ₹/month. */
  monthlyIncome: number | null;
  /** Average monthly card spend from statements, ₹. */
  averageMonthlySpend: number | null;
  hasStatements: boolean;
}
