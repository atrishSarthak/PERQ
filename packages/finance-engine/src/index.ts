// Pure money math for PERQ (handoff §0.5). No I/O, no Node or Next APIs:
// consumed by the web API and by the Expo app alike. All returned money is
// integer rupees, rounded once at the end of a calculation.
export * from "./types";
export * from "./finance";
export { formatInr } from "./format";
export { reconcile, reconcileTolerance, type ReconcileInput, type ReconcileResult } from "./reconcile";
export {
  stripCardNumbers,
  normalizeMerchant,
  isUpiLine,
  isInternational,
  classifyKind,
  categoryForKind,
  ruleCategory,
  categoriseOne,
  merchantsNeedingAi,
  type TxnCategory,
  type TxnKind,
  type CategorySource,
  type Categorised,
  type CategoriseContext,
  type CategoriseInput,
} from "./categories";
export {
  buildFinancialState,
  bestCardFor,
  amountToReachUtilisation,
  utilisationAfter,
  rewardCategoryOf,
  istDate,
  daysBetween,
  addMonths,
  IST_OFFSET_MIN,
  type FinancialState,
  type CardState,
  type MissedReward,
  type StateInput,
  type StateCardAccount,
  type StateStatement,
  type StateTransaction,
  type StateBudget,
  type StateGoal,
  type CardTerms,
} from "./state";
export * from "./nudges";
