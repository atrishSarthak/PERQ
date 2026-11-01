import type { PlanResult } from "@perq/shared";
import { formatDay, formatInr } from "../format";
import { BANNED_NUDGE_WORDS, numbersIn } from "../nudges/copy";
import { PLANNER_CONFIG } from "./config";

// Ember's plan answer (§7.3). The template is written from the PlanResult
// alone; Gemini may rephrase it, and its text is used only when
// validatePlanExplanation passes (numbers, verdict, tone, length).

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

function creditSentence(r: PlanResult): string | null {
  const c = r.credit;
  if (!c || c.after === null || c.after <= PLANNER_CONFIG.utilisationInfoPct) return null;
  const pay = c.payToStayUnder30 ? `, so pay ${formatInr(c.payToStayUnder30)} early${c.nextStatementDate ? ` before ${formatDay(c.nextStatementDate)}` : ""} if you can` : "";
  return `Your limit use goes to ${pct(c.after)}${pay}.`;
}

function costSentence(r: PlanResult): string {
  const o = r.recommended;
  if (o.kind === "upi") return `Paying by UPI or debit costs ${formatInr(o.netCost)}${o.offerDiscount ? " after offers" : ""}.`;
  const saving = o.savingVsUpi > 0 ? `, ${formatInr(o.savingVsUpi)} less than paying by UPI` : "";
  return `Use your ${o.label}: after offers and rewards it costs ${formatInr(o.netCost)}${saving}.`;
}

/** 2–4 plain sentences, verdict first, from the result's numbers only. */
export function planTemplateExplanation(r: PlanResult): string {
  const s: string[] = [];
  const o = r.recommended;
  switch (r.verdict) {
    case "go_with_timing": {
      const t = r.timing;
      s.push(`Go ahead, but on ${formatDay(o.purchaseDate)}.`);
      if (t) s.push(`Buying then gives you ${t.floatBest} interest-free days instead of ${t.floatToday}, because your ${o.label} statement closes just before.`);
      s.push(costSentence(r));
      break;
    }
    case "go":
      s.push(o.kind === "upi" ? "Go ahead." : `Go ahead with your ${o.label}${o.purchaseDate !== r.asOf ? ` on ${formatDay(o.purchaseDate)}` : ""}.`);
      s.push(o.kind === "upi" ? costSentence(r) : `After offers and rewards it costs ${formatInr(o.netCost)}${o.savingVsUpi > 0 ? `, ${formatInr(o.savingVsUpi)} less than paying by UPI` : ""}.`);
      break;
    case "wait": {
      s.push("Better to wait.");
      const a = r.affordability;
      const slip = [...a.goalImpacts].sort((x, y) => y.monthsSlip - x.monthsSlip)[0];
      if (r.verdictReason === "goal_slip" && slip) s.push(`Buying it now would push your ${slip.name} goal back by about ${slip.monthsSlip} months.`);
      else if (a.leftThisMonth !== null) s.push(`It costs ${formatInr(o.effectivePrice)} and you have ${formatInr(Math.max(0, a.leftThisMonth))} left to spend this month.`);
      s.push("A savings goal for it would let you buy it without stretching your month.");
      break;
    }
    case "rethink_payment": {
      s.push("Pay a different way.");
      const picked = r.chosen?.option;
      if (r.verdictReason === "chosen_high_util" && picked) {
        s.push(`Your ${picked.label} would go to ${pct(picked.utilisationAfterPct ?? 0)} of its limit, which can weigh on your credit score.`);
        s.push(costSentence(r));
      } else if (r.verdictReason === "costly_payment" && picked && picked.kind !== "card_emi" && r.chosen!.extraCost > 0) {
        s.push(`${picked.kind === "upi" ? "Paying by UPI or debit" : `Your ${picked.label}`} would cost ${formatInr(r.chosen!.extraCost)} more.`);
        s.push(costSentence(r));
      } else if (r.verdictReason === "costly_payment" && r.emi) {
        s.push(`The EMI costs ${formatInr(r.emi.extraCostVsFullPayment)} more than paying in full, in GST, fees and lost rewards.`);
        s.push(costSentence(r));
      } else {
        s.push(`Every card would go above ${PLANNER_CONFIG.utilisationWarnPct}% of its limit, which can weigh on your credit score.`);
        s.push(`Paying by UPI or debit keeps your limits clear.`);
      }
      break;
    }
  }
  if (s.length < 4 && r.verdict !== "rethink_payment") {
    const c = creditSentence(r);
    if (c) s.push(c);
  }
  if (s.length < 4 && r.missingData[0]) s.push(r.missingData[0].text);
  return s.slice(0, 4).join(" ");
}

/** Item judgement, pressure, and investment or loan advice (§2, §7.3). */
export const BANNED_PLAN_PHRASES = [
  "don't buy", "do not buy", "not worth", "waste", "wasteful", "unnecessary", "luxury", "splurge", "impulse",
  "do you really need", "you don't need", "frivolous", "overpriced", "invest", "investment", "investing", "mutual fund", "stocks", "sip",
  "personal loan", "take a loan", "borrow", "buy now", "before it's gone", "limited time", "hurry",
] as const;

const VERDICT_PHRASE: Record<PlanResult["verdict"], RegExp> = {
  go: /\bgo ahead\b/i,
  go_with_timing: /\bgo ahead\b/i,
  wait: /\bwait\b/i,
  rethink_payment: /\b(different way|pay (it )?(by|with|in full))\b/i,
};
const CONTRADICTS: Record<PlanResult["verdict"], RegExp | null> = {
  go: /\bbetter to wait\b|\bwait\b/i,
  go_with_timing: /\bbetter to wait\b/i,
  wait: /\bgo ahead\b/i,
  rethink_payment: null,
};

/** Numbers the explanation may use: every number in the result (dates' day digits included) and the policy thresholds. */
export function planAllowedNumbers(r: PlanResult): Set<number> {
  const out = new Set<number>();
  const json = JSON.stringify(r);
  for (const m of json.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    out.add(n);
    out.add(Math.abs(n));
    out.add(Math.round(Math.abs(n)));
  }
  [PLANNER_CONFIG.utilisationInfoPct, PLANNER_CONFIG.utilisationWarnPct, PLANNER_CONFIG.utilisationBlockPct, r.options.length].forEach((n) => out.add(n));
  return out;
}

export type ExplanationCheck = { ok: true } | { ok: false; reason: string };

export function validatePlanExplanation(text: string, r: PlanResult): ExplanationCheck {
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (t.length > 600) return { ok: false, reason: "too long" };
  const sentences = t.split(/(?<=[.?])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length < 2 || sentences.length > 4) return { ok: false, reason: `sentences: ${sentences.length}` };
  const lower = t.toLowerCase();
  const urgent = BANNED_NUDGE_WORDS.find((w) => (w === "!" ? t.includes("!") : new RegExp(`\\b${w.replace(/'/g, "['’]")}\\b`).test(lower)));
  if (urgent) return { ok: false, reason: `urgency: ${urgent}` };
  const judged = BANNED_PLAN_PHRASES.find((p) => new RegExp(`\\b${p.replace(/'/g, "['’]")}\\b`).test(lower));
  if (judged) return { ok: false, reason: `banned: ${judged}` };
  if (/\d\s*(k|l|lakh|lakhs|lac|cr|crore)\b/i.test(t)) return { ok: false, reason: "abbreviated amount" };
  // Verdict first: the first sentence carries it, and nothing contradicts it.
  if (!VERDICT_PHRASE[r.verdict].test(sentences[0]!)) return { ok: false, reason: "verdict not first" };
  const contra = CONTRADICTS[r.verdict];
  if (contra && contra.test(t)) return { ok: false, reason: "contradicts verdict" };
  const allowed = planAllowedNumbers(r);
  const stray = numbersIn(t).find((n) => !allowed.has(n));
  if (stray !== undefined) return { ok: false, reason: `number not in result: ${stray}` };
  return { ok: true };
}

/** Narration steps (§7.2) for what the engine actually checked, in order. */
export function planNarration(r: PlanResult, monthName: string): string[] {
  const steps: string[] = [];
  if (r.affordability.basis !== "none") steps.push(`Checked your budget for ${monthName}`);
  const cards = new Set(r.options.filter((o) => o.kind !== "upi").map((o) => o.cardAccountId ?? o.catalogueCardId)).size;
  const offers = r.options.some((o) => o.offersApplied.length || o.offersSkipped.length);
  if (cards) steps.push(`Compared your ${cards} card${cards === 1 ? "" : "s"}${offers ? " with the offers" : ""}`);
  else if (offers) steps.push("Checked the offers");
  if (r.timing) steps.push("Looked at your statement dates");
  if (r.credit && r.credit.after !== null) steps.push("Checked your credit limit");
  if (r.emi) steps.push(r.emi.noCost ? "Worked out the real cost of the no-cost EMI" : "Worked out the real cost of the EMI");
  steps.push("Writing your answer");
  return steps;
}
