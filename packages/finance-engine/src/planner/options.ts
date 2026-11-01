import type { OptionFlag, OptionResult, PlanChoice, PlanInput } from "@perq/shared";
import { amountToReachUtilisation } from "../state";
import { PLANNER_CONFIG } from "./config";
import { addDays, bestPurchaseDate, floatDays, statementOn } from "./dates";
import { emiTrueCost } from "./emi";
import { applyOffers, bankKey, type OfferCard } from "./offers";
import { rewardFor } from "./rewards";
import type { PlanCard } from "./types";

// Payment options (§5.6–5.7). rankPaymentOptions is shared with the Chrome
// extension's /api/extension/analyze: it takes the confirmed input, the
// user's cards as PlanCard[] and the IST day, and nothing else.

const pct1 = (n: number) => Math.round(n * 10) / 10;

export interface UtilisationImpact {
  before: number | null;
  after: number | null;
  /** ₹ to pay before the next statement so utilisation reported is under 30%. */
  payToStayUnder30: number | null;
  nextStatementDate: string | null;
  level: "ok" | "info" | "warn" | "block";
  overLimit: boolean;
}

/**
 * Utilisation before/after putting `amount` on a card (§5.6). `purchaseDate`
 * picks the statement the spend is reported on: that's the date to pay down by.
 */
export function utilizationImpact(card: Pick<PlanCard, "balance" | "creditLimit" | "statementDay">, amount: number, purchaseDate: string): UtilisationImpact {
  const nextStatementDate = card.statementDay ? statementOn(card.statementDay, purchaseDate) : null;
  if (!card.creditLimit) return { before: null, after: null, payToStayUnder30: null, nextStatementDate, level: "ok", overLimit: false };
  const balance = Math.max(0, card.balance ?? 0);
  const before = pct1((balance / card.creditLimit) * 100);
  const after = pct1(((balance + amount) / card.creditLimit) * 100);
  const c = PLANNER_CONFIG;
  const level = after > c.utilisationBlockPct ? "block" : after > c.utilisationWarnPct ? "warn" : after > c.utilisationInfoPct ? "info" : "ok";
  return {
    before,
    after,
    payToStayUnder30: amountToReachUtilisation(balance + amount, card.creditLimit, c.utilisationTargetPct),
    nextStatementDate,
    level,
    overLimit: balance + amount > card.creditLimit,
  };
}

const offerCard = (c: PlanCard): OfferCard => ({
  issuer: c.issuer,
  label: c.label,
  name: c.terms?.name ?? null,
  networks: c.terms?.networks ?? null,
});

const cardKey = (c: PlanCard) => c.cardAccountId ?? `cat-${c.terms?.id ?? c.label}`;

function utilFlags(u: UtilisationImpact): OptionFlag[] {
  const f: OptionFlag[] = [];
  if (u.after === null) return f;
  if (u.after > PLANNER_CONFIG.utilisationInfoPct) f.push("util_over_30");
  if (u.after > PLANNER_CONFIG.utilisationWarnPct) f.push("util_over_70");
  if (u.level === "block") f.push("util_blocked");
  if (u.overLimit) f.push("over_limit");
  return f;
}
const WARNING_FLAGS = new Set<OptionFlag>(["util_over_30", "util_over_70", "unreconciled"]);

type Draft = Omit<OptionResult, "rank" | "savingVsUpi">;

function cardBase(c: PlanCard): { flags: OptionFlag[] } {
  const flags: OptionFlag[] = [];
  if (!c.terms) flags.push("no_card_terms");
  if (!c.statementDay || !c.dueDay) flags.push("no_statement_dates");
  if (!c.creditLimit) flags.push("no_credit_limit");
  if (c.hasUnreconciled) flags.push("unreconciled");
  return { flags };
}

function fullOption(input: PlanInput, c: PlanCard, date: string, idSuffix: "today" | "best" | "picked"): Draft {
  const offers = applyOffers(input.offers, offerCard(c), input.price);
  const effectivePrice = input.price - offers.discount;
  const reward = c.terms ? rewardFor(c.terms, input.item.category, effectivePrice, { monthSpendByCategory: c.monthSpendByCategory }).reward : 0;
  const f = floatDays(c, date);
  const u = utilizationImpact(c, effectivePrice, date);
  return {
    id: `card:${cardKey(c)}:${idSuffix}`,
    kind: "card_full",
    cardAccountId: c.cardAccountId,
    catalogueCardId: c.terms?.id ?? null,
    label: c.label,
    purchaseDate: date,
    stickerPrice: input.price,
    offerDiscount: offers.discount,
    effectivePrice,
    rewards: reward,
    extraCosts: 0,
    netCost: effectivePrice - reward,
    offersApplied: offers.applied,
    offersSkipped: offers.skipped,
    interestFreeDays: f?.days ?? null,
    billedOn: f?.billedOn ?? null,
    dueOn: f?.dueOn ?? null,
    utilisationAfterPct: u.after,
    blocked: u.level === "block" || u.overLimit,
    flags: [...cardBase(c).flags, ...utilFlags(u)],
  };
}

function emiOption(input: PlanInput, c: PlanCard, i: number, today: string): Draft {
  const spec = input.emiOptions[i]!;
  const offers = applyOffers(input.offers, offerCard(c), input.price, { emi: true });
  const effectivePrice = input.price - offers.discount;
  const r = c.terms ? rewardFor(c.terms, input.item.category, effectivePrice, { emi: true, monthSpendByCategory: c.monthSpendByCategory }) : null;
  const rewardsLost = r?.lostToEmi ? r.fullPaymentReward : 0;
  const emi = emiTrueCost(spec, effectivePrice, { rewardsLost });
  // Rewards lost are already missing from `rewards`; extraCosts is interest, GST and fees only.
  const extraCosts = Math.max(0, emi.extraCostVsFullPayment - emi.rewardsLost);
  const u = utilizationImpact(c, emi.blockedLimit, today);
  const flags = [...cardBase(c).flags.filter((x) => x !== "no_statement_dates"), ...utilFlags(u)];
  if (rewardsLost > 0) flags.push("rewards_lost_on_emi");
  const f = floatDays(c, today);
  return {
    id: `emi:${cardKey(c)}:${i}`,
    kind: "card_emi",
    cardAccountId: c.cardAccountId,
    catalogueCardId: c.terms?.id ?? null,
    label: `${c.label}, ${spec.noCost ? "no-cost " : ""}EMI ${spec.tenureMonths} months`,
    purchaseDate: today,
    stickerPrice: input.price,
    offerDiscount: offers.discount,
    effectivePrice,
    rewards: r?.reward ?? 0,
    extraCosts,
    netCost: effectivePrice - (r?.reward ?? 0) + extraCosts,
    offersApplied: offers.applied,
    offersSkipped: offers.skipped,
    interestFreeDays: null,
    billedOn: f?.billedOn ?? null,
    dueOn: f?.dueOn ?? null, // first instalment
    utilisationAfterPct: u.after,
    blocked: u.level === "block" || u.overLimit,
    flags,
    emi,
  };
}

function upiOption(input: PlanInput, today: string): Draft {
  const offers = applyOffers(input.offers, null, input.price);
  const effectivePrice = input.price - offers.discount;
  return {
    id: "upi",
    kind: "upi",
    cardAccountId: null,
    catalogueCardId: null,
    label: "UPI or debit card",
    purchaseDate: today,
    stickerPrice: input.price,
    offerDiscount: offers.discount,
    effectivePrice,
    rewards: 0,
    extraCosts: 0,
    netCost: effectivePrice,
    offersApplied: offers.applied,
    offersSkipped: offers.skipped,
    interestFreeDays: null,
    billedOn: null,
    dueOn: null,
    utilisationAfterPct: null,
    blocked: false,
    flags: [],
  };
}

/** The buying window: today to the need-by date, or today + 14 days (§5.5). */
export function buyingWindow(input: Pick<PlanInput, "needBy">, today: string): { from: string; to: string } {
  const to = input.needBy && input.needBy >= today ? input.needBy : input.needBy ? today : addDays(today, PLANNER_CONFIG.defaultWindowDays);
  return { from: today, to };
}

/** Does an EMI option apply to this card? A named bank must match; otherwise any card. */
function emiAppliesTo(bankName: string | undefined, c: PlanCard): boolean {
  return !bankName || bankKey(bankName) === bankKey(c.issuer);
}

/**
 * Every way the user could pay (§5.7), ranked by net cost, then fewer
 * warnings, then more interest-free days. Blocked options (> 90% or over the
 * limit) are listed but never ranked ahead of an unblocked one. And an option
 * that takes a card above 70% only stays first if it saves at least ₹500
 * (rethinkExtraCost) over the best option that doesn't: small savings aren't
 * worth a high utilisation.
 */
export function rankPaymentOptions(input: PlanInput, cards: PlanCard[], today: string): OptionResult[] {
  const drafts: Draft[] = [];
  const { from, to } = buyingWindow(input, today);
  for (const c of cards) {
    drafts.push(fullOption(input, c, today, "today"));
    const best = bestPurchaseDate(c, from, to);
    if (best && best.bestDate !== today && best.extraDays >= PLANNER_CONFIG.timingMinGainDays) {
      drafts.push(fullOption(input, c, best.bestDate, "best"));
    }
    input.emiOptions.forEach((e, i) => {
      if (emiAppliesTo(e.bankName, c)) drafts.push(emiOption(input, c, i, today));
    });
  }
  const upi = upiOption(input, today);
  drafts.push(upi);

  const warnings = (d: Draft) => d.flags.filter((f) => WARNING_FLAGS.has(f)).length;
  const sorted = drafts
    .map((d, i) => ({ d, i }))
    .sort(
      (a, b) =>
        Number(a.d.blocked) - Number(b.d.blocked) ||
        a.d.netCost - b.d.netCost ||
        warnings(a.d) - warnings(b.d) ||
        (b.d.interestFreeDays ?? -1) - (a.d.interestFreeDays ?? -1) ||
        a.i - b.i
    );
  const healthy = sorted.findIndex(({ d }) => !d.blocked && !d.flags.includes("util_over_70"));
  if (healthy > 0 && sorted[healthy]!.d.netCost - sorted[0]!.d.netCost < PLANNER_CONFIG.rethinkExtraCost) {
    sorted.unshift(...sorted.splice(healthy, 1));
  }
  return sorted.map(({ d }, idx) => ({ ...d, savingVsUpi: upi.netCost - d.netCost, rank: idx + 1 }));
}

/** The card an option is on, if any. */
export function cardOfOption(o: Pick<OptionResult, "id" | "kind">, cards: PlanCard[]): PlanCard | undefined {
  if (o.kind === "upi") return undefined;
  return cards.find((c) => o.id.startsWith(`card:${cardKey(c)}:`) || o.id.startsWith(`emi:${cardKey(c)}:`));
}

/**
 * The option for a way to pay the user picked in a what-if (§9): a card
 * ("upi" for UPI), a day to buy, or an EMI tenure. Uses a ranked option when
 * one matches; a card on a day that wasn't ranked is built the same way and
 * ranked after the others. Null when the pick doesn't exist (an unknown card,
 * or no EMI of that tenure on it). Days before today count as today.
 */
export function chooseOption(input: PlanInput, cards: PlanCard[], today: string, ranked: OptionResult[], choice: PlanChoice): OptionResult | null {
  if (choice.cardAccountId === "upi") return ranked.find((o) => o.kind === "upi") ?? null;
  let card = choice.cardAccountId ? cards.find((c) => c.cardAccountId === choice.cardAccountId) : undefined;
  if (choice.cardAccountId && !card) return null;
  if (choice.emiTenure) {
    return ranked.find((o) => o.kind === "card_emi" && o.emi?.tenureMonths === choice.emiTenure && (!card || cardOfOption(o, cards) === card)) ?? null;
  }
  if (!card) {
    const top = ranked.find((o) => o.kind === "card_full");
    card = top && cardOfOption(top, cards);
    if (!card) return null;
  }
  if (!choice.purchaseDate) {
    // A card with no day picked: its best ranked way in full (which may be its best day).
    const first = ranked.find((o) => o.kind === "card_full" && cardOfOption(o, cards) === card);
    if (first) return first;
  }
  const date = choice.purchaseDate && choice.purchaseDate > today ? choice.purchaseDate : today;
  const hit = ranked.find((o) => o.kind === "card_full" && o.purchaseDate === date && cardOfOption(o, cards) === card);
  if (hit) return hit;
  const upi = ranked.find((o) => o.kind === "upi")!;
  const d = fullOption(input, card, date, "picked");
  return { ...d, savingVsUpi: upi.netCost - d.netCost, rank: ranked.length + 1 };
}
