// Purchase planner (Step 3 §5). Pure: dates are IST days, money integer ₹.
export * from "./types";
export { PLANNER_CONFIG } from "./config";
export { floatDays, bestPurchaseDate, statementOn, dueAfter, dayInMonth, addDays, type FloatDays, type BestPurchaseDate } from "./dates";
export { applyOffer, applyOffers, bankKey, type OfferCard, type OfferOutcome } from "./offers";
export { rewardFor, type RewardOutcome } from "./rewards";
export { emiTrueCost, emiInstalment } from "./emi";
export { rankPaymentOptions, utilizationImpact, buyingWindow, type UtilisationImpact } from "./options";
export { planPurchase, affordability, decideVerdict, planCardsFromState, planContextFromState, floatToday } from "./plan";
export { planTemplateExplanation, validatePlanExplanation, planAllowedNumbers, planNarration, BANNED_PLAN_PHRASES, type ExplanationCheck } from "./explain";
