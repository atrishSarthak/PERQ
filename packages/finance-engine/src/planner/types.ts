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
  cardAccountId: string;
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
