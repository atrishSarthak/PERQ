import type { Affordability, OptionResult, PlanChoice, PlanInput, PlanResult, Verdict, VerdictReason } from "@perq/shared";
import { formatDay, formatInr } from "../format";
import type { CardState, FinancialState } from "../state";
import { addMonths, daysBetween } from "../state";
import { PLANNER_CONFIG } from "./config";
import { bestPurchaseDate, floatDays } from "./dates";
import { buyingWindow, chooseOption, rankPaymentOptions, utilizationImpact } from "./options";
import type { PlanCard, PlanCardTerms, PlanContext } from "./types";

// The whole plan (§5.7): options, affordability, timing, credit, EMI and the
// verdict, decided by the Locked rules in order. Gemini only words it.

const C = PLANNER_CONFIG;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * PlanCards from the financial state (one per active card account), plus
 * cards the user holds in their Step 1 profile but hasn't added a statement for.
 */
export function planCardsFromState(
  state: Pick<FinancialState, "cards">,
  termsById: Map<string, PlanCardTerms>,
  heldCatalogueIds: string[] = []
): PlanCard[] {
  const fromAccounts = state.cards.map((c: CardState): PlanCard => {
    // Balance basis (§5.6): a newer manual balance, else the last statement, 0 once that's marked paid.
    const balance = c.balanceSource === "statement" && c.isPaidMarked ? 0 : c.balanceForUtilisation;
    return {
      cardAccountId: c.cardAccountId,
      label: c.label,
      issuer: c.issuer,
      terms: c.catalogueCardId ? (termsById.get(c.catalogueCardId) ?? null) : null,
      statementDay: c.statementDay,
      dueDay: c.dueDay,
      creditLimit: c.creditLimit,
      balance,
      hasUnreconciled: c.hasUnreconciled,
      monthSpendByCategory: c.monthSpendByRewardCategory,
    };
  });
  const linked = new Set(state.cards.map((c) => c.catalogueCardId).filter(Boolean));
  const quizOnly = heldCatalogueIds
    .filter((id) => !linked.has(id) && termsById.has(id))
    .map((id): PlanCard => {
      const t = termsById.get(id)!;
      return { cardAccountId: null, label: t.name, issuer: t.issuer, terms: t, statementDay: null, dueDay: null, creditLimit: null, balance: null, hasUnreconciled: false, monthSpendByCategory: {} };
    });
  return [...fromAccounts, ...quizOnly];
}

/** The planner's context from a FinancialState (the web API's path). */
export function planContextFromState(
  state: FinancialState,
  opts: { termsById: Map<string, PlanCardTerms>; heldCatalogueIds?: string[]; monthlyIncome: number | null; averageMonthlySpend: number | null }
): PlanContext {
  return {
    today: state.asOf,
    cards: planCardsFromState(state, opts.termsById, opts.heldCatalogueIds),
    leftToSpend: state.month.leftToSpend,
    monthBudget: state.month.budget?.totalLimit ?? null,
    monthSpend: state.month.totalSpend,
    goals: state.goals.map((g) => ({ id: g.id, name: g.name, monthlyNeeded: g.monthlyNeeded })),
    monthlyIncome: opts.monthlyIncome,
    averageMonthlySpend: opts.averageMonthlySpend,
    hasStatements: !!state.dataThrough,
  };
}

/** Budget, due-date, goal and size checks (§5.7) for the recommended option. */
export function affordability(input: PlanInput, rec: OptionResult, ctx: PlanContext): Affordability & { savingRate: number | null; savingRateFrom: "income" | "goals" | null } {
  let basis: Affordability["basis"] = "none";
  let left: number | null = null;
  // Bought in a later month, it comes out of that month's allowance, with nothing spent yet.
  const forMonth = rec.purchaseDate.slice(0, 7);
  const later = forMonth > ctx.today.slice(0, 7);
  if (ctx.leftToSpend !== null) {
    basis = "budget";
    left = later && ctx.monthBudget != null ? ctx.monthBudget : ctx.leftToSpend;
  } else if (ctx.monthlyIncome) {
    basis = "income_estimate";
    left = Math.round(ctx.monthlyIncome * C.incomeDiscretionaryShare) - (later ? 0 : ctx.monthSpend);
  }
  const amount = rec.effectivePrice;

  // When the money is needed: the due date for a card in full, the first instalment for EMI, now for UPI.
  const neededByDate = rec.kind === "upi" ? ctx.today : rec.dueOn;
  const neededAmount = rec.kind === "card_emi" ? (rec.emi?.monthlyInstalment ?? null) : amount;

  // Goal impact: the part of the price that doesn't fit what's left this month comes out of
  // savings, so each goal waits that many months of saving (price ÷ monthly saving rate).
  let savingRate: number | null = null;
  let savingRateFrom: "income" | "goals" | null = null;
  if (ctx.monthlyIncome && ctx.averageMonthlySpend !== null && ctx.monthlyIncome - ctx.averageMonthlySpend > 0) {
    savingRate = ctx.monthlyIncome - ctx.averageMonthlySpend;
    savingRateFrom = "income";
  } else {
    const pace = ctx.goals.reduce((s, g) => s + (g.monthlyNeeded ?? 0), 0);
    if (pace > 0) {
      savingRate = pace;
      savingRateFrom = "goals";
    }
  }
  const overshoot = left === null ? 0 : Math.max(0, amount - Math.max(0, left));
  const goalImpacts =
    savingRate && overshoot > 0
      ? ctx.goals.filter((g) => (g.monthlyNeeded ?? 0) > 0).map((g) => ({ goalId: g.id, name: g.name, monthsSlip: r1(overshoot / savingRate!) }))
      : [];

  const share = ctx.monthlyIncome ? (input.price / ctx.monthlyIncome) * 100 : null;
  return {
    leftThisMonth: left,
    afterPurchase: left === null ? null : left - amount,
    neededByDate,
    neededAmount,
    sizeLabel: share === null ? "unknown" : share < C.sizeSmallPct ? "small" : share <= C.sizeLargePct ? "medium" : "large",
    goalImpacts,
    basis,
    forMonth,
    monthlyIncome: ctx.monthlyIncome,
    savingRate,
    savingRateFrom,
  };
}

/**
 * The Locked verdict rules of §5.7, in order. `picked` is a way to pay the
 * user chose in a what-if: it's judged in place of the top option, and stays
 * the recommendation unless a rethink rule fires.
 */
export function decideVerdict(
  input: PlanInput,
  options: OptionResult[],
  afford: Affordability,
  today: string,
  picked?: OptionResult
): { verdict: Verdict; reason: VerdictReason; recommended: OptionResult } {
  const top = options[0]!;
  // 1. rethink_payment. The user's chosen way to pay is the pick, else the EMI they confirmed
  //    (best of them); without either, the default is the top option, which is never beaten.
  const emis = options.filter((o) => o.kind === "card_emi");
  const chosenEmi = picked ? (picked.kind === "card_emi" ? picked : null) : input.emiOptions.length && emis.length ? emis[0]! : null;
  if (chosenEmi && (chosenEmi.emi?.extraCostVsFullPayment ?? 0) >= C.rethinkExtraCost && options.some((o) => !o.blocked && o.netCost < chosenEmi.netCost)) {
    return { verdict: "rethink_payment", reason: "costly_payment", recommended: top };
  }
  if (picked && picked !== top) {
    if (picked.netCost - top.netCost >= C.rethinkExtraCost) return { verdict: "rethink_payment", reason: "costly_payment", recommended: top };
    const pickedHigh = picked.blocked || (picked.utilisationAfterPct ?? 0) > C.utilisationWarnPct;
    const topHigh = top.blocked || (top.utilisationAfterPct ?? 0) > C.utilisationWarnPct;
    if (pickedHigh && !topHigh) return { verdict: "rethink_payment", reason: "chosen_high_util", recommended: top };
  }
  const cardFull = options.filter((o) => o.kind === "card_full" && o.purchaseDate === today);
  if ((!picked || picked.kind !== "upi") && cardFull.length && cardFull.every((o) => o.utilisationAfterPct !== null && o.utilisationAfterPct > C.utilisationWarnPct)) {
    return { verdict: "rethink_payment", reason: "all_cards_high_util", recommended: options.find((o) => o.kind === "upi") ?? top };
  }
  const base = picked ?? top;
  // 2. wait.
  const needSoon = !!input.needBy && daysBetween(today, input.needBy) <= C.waitNeedByDays;
  if (afford.leftThisMonth !== null && !needSoon) {
    const limit = Math.max(0, afford.leftThisMonth) * (1 + C.waitOverBudgetPct / 100);
    if (base.effectivePrice > limit) return { verdict: "wait", reason: "over_budget", recommended: base };
  }
  if (afford.goalImpacts.some((g) => g.monthsSlip > C.goalSlipMonths)) return { verdict: "wait", reason: "goal_slip", recommended: base };
  // 3. go_with_timing: a card in full on a later day that gains ≥ 10 interest-free days over today.
  if (base.kind === "card_full" && base.purchaseDate !== today) {
    const sameCardToday = options.find((o) => o.kind === "card_full" && o.purchaseDate === today && o.cardAccountId === base.cardAccountId && o.catalogueCardId === base.catalogueCardId);
    const gain = (base.interestFreeDays ?? 0) - (sameCardToday?.interestFreeDays ?? 0);
    if (!picked || gain >= C.timingMinGainDays) return { verdict: "go_with_timing", reason: "timing_gain", recommended: base };
  }
  return { verdict: "go", reason: "default", recommended: base };
}

function headline(verdict: Verdict, rec: OptionResult): string {
  switch (verdict) {
    case "go":
      return rec.kind === "upi" ? "Go ahead" : `Go ahead, with your ${rec.label}`;
    case "go_with_timing":
      return `Go ahead, on ${formatDay(rec.purchaseDate)}`;
    case "wait":
      return "Better to wait";
    case "rethink_payment":
      return `Pay a different way: ${rec.kind === "upi" ? "UPI or debit" : rec.label}`;
  }
}

/** A what-if pick that doesn't exist: an unknown card, or no EMI of that tenure. */
export class PlanChoiceError extends Error {}

/**
 * Runs the whole planner. Every number in the result comes from here.
 * `choice` is a what-if pick (§9); without one, the engine picks.
 */
export function planPurchase(input: PlanInput, ctx: PlanContext, choice?: PlanChoice): PlanResult {
  let options = rankPaymentOptions(input, ctx.cards, ctx.today);
  const hasPick = !!choice && (choice.cardAccountId !== undefined || choice.purchaseDate !== undefined || choice.emiTenure !== undefined);
  const picked = hasPick ? chooseOption(input, ctx.cards, ctx.today, options, choice!) : undefined;
  if (hasPick && !picked) throw new PlanChoiceError(choice!.emiTenure ? "There's no EMI of that length on that card." : "That card isn't one of yours.");
  if (picked && !options.includes(picked)) options = [...options, picked];
  const prelim = affordability(input, picked ?? options[0]!, ctx);
  const { verdict, reason, recommended } = decideVerdict(input, options, prelim, ctx.today, picked ?? undefined);
  const afford = recommended === (picked ?? options[0]) ? prelim : affordability(input, recommended, ctx);
  const { savingRate, savingRateFrom, ...affordOut } = afford;

  const card =
    recommended.kind === "upi"
      ? undefined
      : ctx.cards.find((c) => (recommended.cardAccountId ? c.cardAccountId === recommended.cardAccountId : !c.cardAccountId && c.terms?.id === recommended.catalogueCardId));

  // Timing: for a card in full with known dates. Gains under 10 days are reported as "today is fine".
  let timing: PlanResult["timing"];
  if (card && card.cardAccountId && recommended.kind === "card_full") {
    const { from, to } = buyingWindow(input, ctx.today);
    const b = bestPurchaseDate(card, from, to);
    if (b) {
      const useBest = b.extraDays >= C.timingMinGainDays;
      timing = {
        cardAccountId: card.cardAccountId,
        bestDate: useBest ? b.bestDate : ctx.today,
        floatToday: b.floatToday,
        floatBest: useBest ? b.floatBest : b.floatToday,
        extraDays: useBest ? b.extraDays : 0,
      };
    }
  }

  let credit: PlanResult["credit"];
  if (card && card.cardAccountId) {
    const u = utilizationImpact(card, recommended.emi?.blockedLimit ?? recommended.effectivePrice, recommended.purchaseDate);
    credit = { cardAccountId: card.cardAccountId, before: u.before, after: u.after, payToStayUnder30: u.after !== null && u.after > C.utilisationTargetPct ? u.payToStayUnder30 : null, nextStatementDate: u.nextStatementDate };
  }

  const emi = (picked?.kind === "card_emi" ? picked.emi : undefined) ?? options.find((o) => o.kind === "card_emi")?.emi;

  // Missing data, said out loud (§2).
  const missing: PlanResult["missingData"] = [];
  const accounts = ctx.cards.filter((c) => c.cardAccountId);
  if (!ctx.cards.length) missing.push({ code: "no_cards", text: "You haven't added any cards, so I compared UPI and debit only." });
  else if (!ctx.hasStatements) missing.push({ code: "no_statements", text: "No statements yet, so I don't know your balances, limits or statement dates." });
  if (afford.basis === "income_estimate") missing.push({ code: "no_budget", text: "No budget set, so I used a rough limit of 30% of your income." });
  if (afford.basis === "none") missing.push({ code: "no_budget", text: "No budget or income, so I couldn't check if this fits your month." });
  if (!ctx.monthlyIncome) missing.push({ code: "no_income", text: "I don't know your income, so I can't size this purchase." });
  for (const c of accounts) {
    if (!c.statementDay || !c.dueDay) missing.push({ code: "no_statement_dates", text: `I don't have your ${c.label} statement dates, so I can't time this.` });
    if (!c.creditLimit) missing.push({ code: "no_credit_limit", text: `I don't know your ${c.label} credit limit, so I can't check utilisation.` });
    if (!c.terms) missing.push({ code: "no_card_terms", text: `${c.label} isn't linked to a card I know, so I counted no rewards on it.` });
    if (c.hasUnreconciled) missing.push({ code: "unreconciled", text: `A ${c.label} statement didn't add up, so its balance may be off.` });
  }

  const assumptions = [
    "Rewards use each card's published rate and what's left of its monthly cap.",
    "Only one bank offer of each kind applies per order.",
  ];
  if (options.some((o) => o.offersApplied.length && input.offers.some((x) => x.type === "cashback"))) assumptions.push("Cashback is counted as a discount, though it's credited later.");
  if (emi?.assumedRatePa) assumptions.push(`The no-cost EMI's interest rate isn't printed, so I assumed ${emi.assumedRatePa}% a year.`);
  if (input.emiOptions.length) assumptions.push("Spend converted to EMI earns no rewards unless the card says it does.");
  if (savingRateFrom === "income" && savingRate) assumptions.push(`You save about ${formatInr(savingRate)} a month (income minus average card spend).`);
  if (savingRateFrom === "goals" && savingRate) assumptions.push(`You save about ${formatInr(savingRate)} a month (what your goals need).`);

  // A savings goal for a wait (§8): the price, at what's left of the saving rate after other goals.
  let goalProposal: PlanResult["goalProposal"];
  if (verdict === "wait") {
    const committed = ctx.goals.reduce((s, g) => s + Math.max(0, g.monthlyNeeded ?? 0), 0);
    // A saving rate taken from the goals themselves is already spoken for.
    const spare = savingRate !== null && savingRateFrom === "income" ? Math.round(savingRate - committed) : null;
    const months = spare && spare > 0 ? Math.ceil(input.price / spare) : null;
    goalProposal = {
      name: input.item.name.slice(0, 60),
      target: input.price,
      targetDate: months ? addMonths(ctx.today, months) : null,
      monthlySaving: months ? Math.ceil(input.price / months) : null,
    };
    if (months) assumptions.push(`The goal date assumes you put aside ${formatInr(Math.ceil(input.price / months))} a month for it.`);
  }

  return {
    verdict,
    verdictReason: reason,
    headline: headline(verdict, recommended),
    recommended,
    options,
    affordability: affordOut,
    timing,
    credit,
    emi,
    ...(goalProposal ? { goalProposal } : {}),
    ...(picked ? { chosen: { option: picked, extraCost: picked.netCost - recommended.netCost } } : {}),
    missingData: missing,
    assumptions,
    asOf: ctx.today,
    engineVersion: C.engineVersion,
  };
}

/** Interest-free days on buying with a card today, for quick answers (Ember's bestCardFor-style tools). */
export function floatToday(card: Pick<PlanCard, "statementDay" | "dueDay">, today: string): number | null {
  return floatDays(card, today)?.days ?? null;
}

/** Plans (and unsaved checks) not acted on expire 30 days after need-by, or 45 days after creation without one (§8). */
export function isPlanExpired(plan: { status: string; needByDate: string | null; createdDay: string }, today: string): boolean {
  if (plan.status !== "draft" && plan.status !== "planned" && plan.status !== "reminder_set") return false;
  return plan.needByDate ? daysBetween(plan.needByDate, today) > C.expireAfterNeedByDays : daysBetween(plan.createdDay, today) > C.expireAfterCreatedDays;
}
