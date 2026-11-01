import type { Category } from "./types";

// The financial state (handoff §6): computed on demand from the user's
// statements, transactions, budgets and goals. Pure, with `now` injected
// so tests and the demo can move time. All calendar maths is in IST.
// Money in the output is integer rupees.

export const IST_OFFSET_MIN = 330;

// ---- dates -----------------------------------------------------------------

/** Calendar date (YYYY-MM-DD) in IST for an instant. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
const toUtcMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / 86_400_000);
}
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

// ---- inputs ----------------------------------------------------------------

export interface CardTerms {
  id: string;
  name: string;
  rewardRates: Partial<Record<Category, number>>; // % value back
  redemptionValue: number | null; // ₹ per point
  feeWaiverSpend: number | null;
  annualFee: number;
}

export interface StateCardAccount {
  id: string;
  label: string;
  last4: string;
  issuer: string;
  creditLimit: number | null;
  feeAnniversaryMonth: number | null;
  currentBalanceOverride: number | null;
  currentBalanceUpdatedAt: string | null; // ISO instant
  isActive: boolean;
  terms: CardTerms | null; // null when not linked to a catalogue card
}

export interface StateStatement {
  id: string;
  cardAccountId: string;
  statementDate: string;
  dueDate: string | null;
  totalDue: number | null;
  minimumDue: number | null;
  previousBalance: number | null;
  paymentsCredits: number | null;
  feesCharges: number | null;
  financeCharges: number | null;
  creditLimit: number | null;
  pointsClosing: number | null;
  pointsExpiring: number | null;
  pointsExpiryDate: string | null;
  reconciled: boolean;
  markedPaidAt: string | null;
}

export interface StateTransaction {
  id: string;
  cardAccountId: string;
  statementId: string;
  txnDate: string;
  amount: number;
  direction: "debit" | "credit";
  kind: string;
  category: string;
  merchant: string;
  description: string;
}

export interface StateBudget {
  totalLimit: number | null;
  categoryLimits: Record<string, number>;
}

export interface StateGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  savedAmount: number;
  status: string;
  createdAt: string; // ISO date or instant
}

export interface StateInput {
  now: Date;
  cardAccounts: StateCardAccount[];
  statements: StateStatement[];
  transactions: StateTransaction[];
  budget: StateBudget | null;
  goals: StateGoal[];
}

// ---- outputs ---------------------------------------------------------------

export interface CardState {
  cardAccountId: string;
  label: string;
  last4: string;
  issuer: string;
  catalogueCardId: string | null;
  latestStatement: {
    id: string;
    date: string;
    dueDate: string | null;
    totalDue: number | null;
    minimumDue: number | null;
    reconciled: boolean;
    previousBalance: number | null;
    paymentsCredits: number | null;
    financeCharges: number | null;
  } | null;
  daysToDue: number | null;
  isPaidMarked: boolean;
  creditLimit: number | null;
  balanceForUtilisation: number | null;
  balanceSource: "statement" | "override" | null;
  utilisationPct: number | null;
  nextStatementDate: string | null;
  daysToStatement: number | null;
  points: { closing: number; valueRupees: number | null; expiring: number | null; expiryDate: string | null } | null;
  feeWaiver: {
    threshold: number;
    annualFee: number;
    spentThisCardYear: number;
    remaining: number;
    monthsLeft: number;
    projected: number;
    onPace: boolean;
    cardYearEnds: string;
    startAssumed: boolean;
  } | null;
  feesLastCycle: { total: number; lines: { description: string; amount: number }[] };
  /** Any of this card's statements failed reconciliation (§5.4): rupee nudges from them are held back. */
  hasUnreconciled: boolean;
}

export interface MissedReward {
  txnId: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  usedCardAccountId: string;
  usedCard: string;
  betterCard: string;
  betterCardId: string;
  extra: number;
}

export interface FinancialState {
  asOf: string; // IST date
  dataThrough: string | null; // latest statement date across cards
  cards: CardState[];
  totals: { totalDueAll: number; utilisationOverallPct: number | null };
  month: {
    key: string;
    spendByCategory: Record<string, number>;
    totalSpend: number;
    budget: { totalLimit: number | null; categoryLimits: Record<string, number> } | null;
    leftToSpend: number | null;
    daysLeft: number;
    coverage: "complete" | "partial";
    /** Every statement behind this month's spend reconciled. */
    allReconciled: boolean;
  };
  missedRewardsLastCycle: { total: number; items: MissedReward[] };
  goals: {
    id: string;
    name: string;
    target: number;
    saved: number;
    pctDone: number;
    monthlyNeeded: number | null;
    expectedSaved: number | null;
    behindBy: number;
    targetDate: string | null;
  }[];
}

// ---- helpers used by rules and Ember tools -----------------------------------

/** Non-spending categories, left out of month spend. */
const NON_SPEND = new Set(["transfers", "fees_interest", "emi", "cash"]);

/** Statement categories → the 9 reward categories card terms use. */
export function rewardCategoryOf(category: string): Category | null {
  switch (category) {
    case "food_delivery":
    case "online_shopping":
    case "groceries":
    case "dining":
    case "fuel":
    case "bills":
    case "travel":
    case "upi":
      return category;
    case "entertainment":
    case "health":
    case "education":
    case "other":
      return "other";
    default:
      return null;
  }
}

/** Best held card for a category (§6 "best card in hindsight"), by % value back. */
export function bestCardFor(category: string, amount: number, held: CardTerms[]): { cardId: string; name: string; ratePct: number; reward: number } | null {
  const rc = rewardCategoryOf(category);
  if (!rc) return null;
  let best: { cardId: string; name: string; ratePct: number; reward: number } | null = null;
  for (const c of held) {
    const rate = c.rewardRates[rc] ?? 0;
    if (!best || rate > best.ratePct) best = { cardId: c.id, name: c.name, ratePct: rate, reward: (amount * rate) / 100 };
  }
  return best;
}

/** ₹ to pay so utilisation drops to targetPct (§7.2 high_utilisation copy). */
export function amountToReachUtilisation(balance: number, limit: number, targetPct: number): number {
  return Math.max(0, Math.ceil(balance - (limit * targetPct) / 100));
}

/** Utilisation % after spending (positive) or paying (negative) an amount. */
export function utilisationAfter(balance: number, limit: number, amount: number): number {
  return limit > 0 ? Math.round(((balance + amount) / limit) * 1000) / 10 : 0;
}

// ---- builder -----------------------------------------------------------------

export function buildFinancialState(input: StateInput): FinancialState {
  const today = istDate(input.now);
  const active = input.cardAccounts.filter((a) => a.isActive);
  const stmtsByCard = new Map<string, StateStatement[]>();
  for (const s of input.statements) stmtsByCard.set(s.cardAccountId, [...(stmtsByCard.get(s.cardAccountId) ?? []), s]);
  for (const list of stmtsByCard.values()) list.sort((a, b) => b.statementDate.localeCompare(a.statementDate));

  const dataThrough = input.statements.map((s) => s.statementDate).sort().at(-1) ?? null;
  const heldTerms = active.map((a) => a.terms).filter((t): t is CardTerms => !!t);

  const cards: CardState[] = active.map((a) => {
    const latest = stmtsByCard.get(a.id)?.[0] ?? null;
    const creditLimit = a.creditLimit ?? latest?.creditLimit ?? null;
    const overrideNewer =
      a.currentBalanceOverride !== null &&
      !!a.currentBalanceUpdatedAt &&
      (!latest || istDate(new Date(a.currentBalanceUpdatedAt)) > latest.statementDate);
    const balance = overrideNewer ? a.currentBalanceOverride : (latest?.totalDue ?? null);
    const utilisationPct = balance !== null && creditLimit ? Math.round((balance / creditLimit) * 1000) / 10 : null;
    const nextStatementDate = latest ? addMonths(latest.statementDate, 1) : null;

    // Points value: printed points × the catalogue card's ₹ per point.
    const points =
      latest?.pointsClosing !== null && latest?.pointsClosing !== undefined
        ? {
            closing: latest.pointsClosing,
            valueRupees: a.terms?.redemptionValue ? Math.round(latest.pointsClosing * a.terms.redemptionValue) : null,
            expiring: latest.pointsExpiring,
            expiryDate: latest.pointsExpiryDate,
          }
        : null;

    // Fee-waiver pace: purchase spend since the last anniversary month.
    let feeWaiver: CardState["feeWaiver"] = null;
    if (a.terms?.feeWaiverSpend && a.terms.annualFee > 0) {
      const cardTxns = input.transactions.filter((t) => t.cardAccountId === a.id);
      let start: string;
      let startAssumed = false;
      if (a.feeAnniversaryMonth) {
        const [y, m] = today.split("-").map(Number) as [number, number];
        const yr = m >= a.feeAnniversaryMonth ? y : y - 1;
        start = `${yr}-${String(a.feeAnniversaryMonth).padStart(2, "0")}-01`;
      } else {
        start = cardTxns.map((t) => t.txnDate).sort()[0] ?? today;
        startAssumed = true;
      }
      const end = addMonths(start, 12);
      const spent = cardTxns
        .filter((t) => t.txnDate >= start && t.txnDate < end && (t.kind === "purchase" || t.kind === "refund"))
        .reduce((s, t) => s + (t.direction === "debit" ? t.amount : -t.amount), 0);
      const monthsElapsed = Math.max(1, Math.round(daysBetween(start, dataThrough && dataThrough < today ? dataThrough : today) / 30.4));
      const monthsLeft = Math.max(0, Math.round(daysBetween(today, end) / 30.4));
      const projected = spent + (spent / monthsElapsed) * monthsLeft;
      feeWaiver = {
        threshold: a.terms.feeWaiverSpend,
        annualFee: a.terms.annualFee,
        spentThisCardYear: Math.round(spent),
        remaining: Math.max(0, Math.round(a.terms.feeWaiverSpend - spent)),
        monthsLeft,
        projected: Math.round(projected),
        onPace: projected >= a.terms.feeWaiverSpend,
        cardYearEnds: end,
        startAssumed,
      };
    }

    const feeLines = latest
      ? input.transactions.filter((t) => t.statementId === latest.id && (t.kind === "fee" || t.kind === "interest"))
      : [];
    return {
      cardAccountId: a.id,
      label: a.label,
      last4: a.last4,
      issuer: a.issuer,
      catalogueCardId: a.terms?.id ?? null,
      latestStatement: latest
        ? {
            id: latest.id,
            date: latest.statementDate,
            dueDate: latest.dueDate,
            totalDue: latest.totalDue,
            minimumDue: latest.minimumDue,
            reconciled: latest.reconciled,
            previousBalance: latest.previousBalance,
            paymentsCredits: latest.paymentsCredits,
            financeCharges: latest.financeCharges,
          }
        : null,
      daysToDue: latest?.dueDate ? daysBetween(today, latest.dueDate) : null,
      isPaidMarked: !!latest?.markedPaidAt,
      creditLimit,
      balanceForUtilisation: balance,
      balanceSource: balance === null ? null : overrideNewer ? "override" : "statement",
      utilisationPct,
      nextStatementDate,
      daysToStatement: nextStatementDate ? daysBetween(today, nextStatementDate) : null,
      points,
      feeWaiver,
      feesLastCycle: {
        total: Math.round(feeLines.reduce((s, t) => s + t.amount, 0)),
        lines: feeLines.map((t) => ({ description: t.description, amount: t.amount })),
      },
      hasUnreconciled: (stmtsByCard.get(a.id) ?? []).some((x) => !x.reconciled),
    };
  });

  // Totals over unpaid dues and all limits.
  const totalDueAll = cards.reduce((s, c) => s + (!c.isPaidMarked && c.latestStatement?.totalDue ? c.latestStatement.totalDue : 0), 0);
  const withUtil = cards.filter((c) => c.balanceForUtilisation !== null && c.creditLimit);
  const limitSum = withUtil.reduce((s, c) => s + c.creditLimit!, 0);
  const utilisationOverallPct = limitSum ? Math.round((withUtil.reduce((s, c) => s + c.balanceForUtilisation!, 0) / limitSum) * 1000) / 10 : null;

  // This month, honest about coverage: statements arrive after the month ends.
  const key = today.slice(0, 7);
  const spendByCategory: Record<string, number> = {};
  for (const t of input.transactions) {
    if (!t.txnDate.startsWith(key) || NON_SPEND.has(t.category)) continue;
    if (t.kind !== "purchase" && t.kind !== "refund") continue;
    spendByCategory[t.category] = (spendByCategory[t.category] ?? 0) + (t.direction === "debit" ? t.amount : -t.amount);
  }
  for (const k of Object.keys(spendByCategory)) spendByCategory[k] = Math.max(0, Math.round(spendByCategory[k]!));
  const totalSpend = Object.values(spendByCategory).reduce((s, v) => s + v, 0);
  const end = monthEnd(key);

  // Best card in hindsight over each card's latest cycle.
  const items: MissedReward[] = [];
  for (const a of active) {
    if (!a.terms) continue;
    const latest = stmtsByCard.get(a.id)?.[0];
    if (!latest) continue;
    for (const t of input.transactions) {
      if (t.statementId !== latest.id || t.kind !== "purchase" || t.direction !== "debit") continue;
      const rc = rewardCategoryOf(t.category);
      if (!rc) continue;
      const usedRate = a.terms.rewardRates[rc] ?? 0;
      const best = bestCardFor(t.category, t.amount, heldTerms);
      if (!best || best.cardId === a.terms.id) continue;
      const extra = (t.amount * (best.ratePct - usedRate)) / 100;
      if (extra > 0) {
        items.push({
          txnId: t.id,
          date: t.txnDate,
          merchant: t.merchant,
          category: t.category,
          amount: t.amount,
          usedCardAccountId: a.id,
          usedCard: a.label,
          betterCard: best.name,
          betterCardId: best.cardId,
          extra: Math.round(extra * 100) / 100,
        });
      }
    }
  }
  items.sort((x, y) => y.extra - x.extra);

  const goals = input.goals
    .filter((g) => g.status === "active")
    .map((g) => {
      const saved = g.savedAmount;
      const monthsLeft = g.targetDate ? Math.max(1, Math.ceil(daysBetween(today, g.targetDate) / 30.4)) : null;
      const created = g.createdAt.slice(0, 10);
      const span = g.targetDate ? Math.max(1, daysBetween(created, g.targetDate)) : null;
      const expectedSaved = span ? Math.round(g.targetAmount * Math.min(1, Math.max(0, daysBetween(created, today)) / span)) : null;
      return {
        id: g.id,
        name: g.name,
        target: g.targetAmount,
        saved,
        pctDone: g.targetAmount ? Math.round((saved / g.targetAmount) * 1000) / 10 : 0,
        monthlyNeeded: monthsLeft ? Math.max(0, Math.ceil((g.targetAmount - saved) / monthsLeft)) : null,
        expectedSaved,
        behindBy: expectedSaved !== null ? Math.max(0, expectedSaved - saved) : 0,
        targetDate: g.targetDate,
      };
    });

  return {
    asOf: today,
    dataThrough,
    cards,
    totals: { totalDueAll: Math.round(totalDueAll), utilisationOverallPct },
    month: {
      key,
      spendByCategory,
      totalSpend,
      budget: input.budget ? { totalLimit: input.budget.totalLimit, categoryLimits: input.budget.categoryLimits } : null,
      leftToSpend: input.budget?.totalLimit !== null && input.budget?.totalLimit !== undefined ? input.budget.totalLimit - totalSpend : null,
      daysLeft: daysBetween(today, end) + 1,
      coverage: dataThrough && dataThrough >= end ? "complete" : "partial",
      allReconciled: (() => {
        const unreconciled = new Set(input.statements.filter((x) => !x.reconciled).map((x) => x.id));
        return !input.transactions.some((t) => t.txnDate.startsWith(key) && unreconciled.has(t.statementId));
      })(),
    },
    missedRewardsLastCycle: { total: Math.round(items.reduce((s, i) => s + i.extra, 0)), items },
    goals,
  };
}
