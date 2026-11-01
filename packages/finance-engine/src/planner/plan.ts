import type { Affordability, OptionResult, PlanInput, PlanResult, Verdict, VerdictReason } from "@perq/shared";
import { formatDay, formatInr } from "../format";
import type { CardState, FinancialState } from "../state";
import { daysBetween } from "../state";
import { PLANNER_CONFIG } from "./config";
import { bestPurchaseDate, floatDays } from "./dates";
import { buyingWindow, rankPaymentOptions, utilizationImpact } from "./options";
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
  if (ctx.leftToSpend !== null) {
    basis = "budget";
    left = ctx.leftToSpend;
  } else if (ctx.monthlyIncome) {
    basis = "income_estimate";
    left = Math.round(ctx.monthlyIncome * C.incomeDiscretionaryShare) - ctx.monthSpend;
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
    monthlyIncome: ctx.monthlyIncome,
    savingRate,
    savingRateFrom,
  };
}

/** The Locked verdict rules of §5.7, in order. */
export function decideVerdict(
  input: PlanInput,
  options: OptionResult[],
  afford: Affordability,
  today: string
): { verdict: Verdict; reason: VerdictReason; recommended: OptionResult } {
  const top = options[0]!;
  // 1. rethink_payment. The user's chosen way to pay is the EMI they confirmed (best of them);
  //    without one, the default is the top option, which is never beaten.
  const emis = options.filter((o) => o.kind === "card_emi");
  const chosen = input.emiOptions.length && emis.length ? emis[0]! : null;
  if (chosen && (chosen.emi?.extraCostVsFullPayment ?? 0) >= C.rethinkExtraCost && options.some((o) => !o.blocked && o.netCost < chosen.netCost)) {
    return { verdict: "rethink_payment", reason: "costly_payment", recommended: top };
  }
  const cardFull = options.filter((o) => o.kind === "card_full" && o.purchaseDate === today);
  if (cardFull.length && cardFull.every((o) => o.utilisationAfterPct !== null && o.utilisationAfterPct > C.utilisationWarnPct)) {
    return { verdict: "rethink_payment", reason: "all_cards_high_util", recommended: options.find((o) => o.kind === "upi") ?? top };
  }
  // 2. wait.
  const needSoon = !!input.needBy && daysBetween(today, input.needBy) <= C.waitNeedByDays;
  if (afford.leftThisMonth !== null && !needSoon) {
    const limit = Math.max(0, afford.leftThisMonth) * (1 + C.waitOverBudgetPct / 100);
    if (top.effectivePrice > limit) return { verdict: "wait", reason: "over_budget", recommended: top };
  }
  if (afford.goalImpacts.some((g) => g.monthsSlip > C.goalSlipMonths)) return { verdict: "wait", reason: "goal_slip", recommended: top };
  // 3. go_with_timing: the top option is a card in full on a later best day (only built when it gains ≥ 10 days).
  if (top.kind === "card_full" && top.purchaseDate !== today) return { verdict: "go_with_timing", reason: "timing_gain", recommended: top };
  return { verdict: "go", reason: "default", recommended: top };
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

/** Runs the whole planner. Every number in the result comes from here. */
export function planPurchase(input: PlanInput, ctx: PlanContext): PlanResult {
  const options = rankPaymentOptions(input, ctx.cards, ctx.today);
  const prelim = affordability(input, options[0]!, ctx);
  const { verdict, reason, recommended } = decideVerdict(input, options, prelim, ctx.today);
  const afford = recommended === options[0] ? prelim : affordability(input, recommended, ctx);
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
    const u = utilizationImpact(card, recommended.emi?.blockedLimit ?? recommended.effectivePrice, ctx.today);
    credit = { cardAccountId: card.cardAccountId, before: u.before, after: u.after, payToStayUnder30: u.after !== null && u.after > C.utilisationTargetPct ? u.payToStayUnder30 : null, nextStatementDate: u.nextStatementDate };
  }

  const emi = options.find((o) => o.kind === "card_emi")?.emi;

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
