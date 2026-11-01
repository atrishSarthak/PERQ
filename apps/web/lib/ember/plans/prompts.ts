import { formatInr } from "@perq/finance-engine";
import type { NudgeChip, PlanResult } from "@perq/shared";
import type { PurchasePlanRow } from "@perq/db";
import { compactResult } from "./compact";

// The planner in chat (Step 3 §6.4, §7, §8): how Ember uses the plan tools,
// and the plan:<id> thread's context, opening line and chips.

export const PLAN_TOOLS_GUIDE = `
Purchase planner tools: extractPlanFromMessage, listPlans, getPlan, whatIfPlan.
When the user asks whether, how or when to buy something ("should I buy…", "can I afford…", "best card for this ₹X phone"), call extractPlanFromMessage with their words. The app then shows a card with what you read; the plan runs only when the user taps it. Don't give a verdict, card or number for a purchase before that. If the price is missing, ask for it.
Ember never judges what the user buys, only how and when to pay.`;

/** The facts of a plan thread's plan; counted as grounded output, like a nudge's. */
export function planThreadContext(row: PurchasePlanRow) {
  const r = row.result as PlanResult | null;
  return {
    planId: row.id,
    item: row.itemName,
    price: row.price,
    status: row.status,
    remindAt: row.remindAt,
    emiTenuresOffered: ((row.emiOptions ?? []) as { tenureMonths: number }[]).map((e) => e.tenureMonths),
    result: r ? compactResult(r) : null,
    explanation: row.explanation,
  };
}

export function planThreadPrompt(row: PurchasePlanRow): string {
  return `
This conversation is about the user's purchase plan for ${row.itemName} (planId ${row.id}).
PLAN DATA (exact numbers from PERQ's engine; quote them as given): ${JSON.stringify(planThreadContext(row))}
Answer from PLAN DATA when it covers the question. For "what if…" questions (another card, an EMI, a different day, waiting a month, another price), call whatIfPlan with planId ${row.id}, lead with its headline (the new verdict, e.g. "Still better to wait" or "Go ahead"), give the reason, and say the result isn't saved; the user can keep a version from the plan screen. Use cardAccountId values from PLAN DATA's options and only the EMI tenures in emiTenuresOffered.
Reminders, goals and "I bought it" are buttons on the plan screen; don't claim to do them yourself.`;
}

/** The plan thread's chips (§8), naming the actual other card so the what-if is unambiguous. */
export function planChips(row: PurchasePlanRow): NudgeChip[] {
  const r = row.result as PlanResult | null;
  const ask = (label: string): NudgeChip => ({ label, action: null });
  const chips: NudgeChip[] = [];
  if (((row.emiOptions ?? []) as unknown[]).length && r?.recommended.kind !== "card_emi") chips.push(ask("What if I use the EMI?"));
  chips.push(ask("What if I wait a month?"));
  const other = r?.options.find((o) => o.kind === "card_full" && o.cardAccountId && o.cardAccountId !== r.recommended.cardAccountId && !o.blocked);
  if (other) chips.push(ask(`What if I use my ${other.label}?`));
  else if (r && r.recommended.kind !== "upi") chips.push(ask("What if I pay by UPI?"));
  return chips;
}

export function planOpening(row: PurchasePlanRow): string {
  const r = row.result as PlanResult | null;
  if (!r) return `This is your plan for the ${row.itemName}. What would you like to know?`;
  return `Your plan for the ${row.itemName} (${formatInr(row.price)}): ${r.headline}. Ask me anything about it, or try a what-if.`;
}

/** Marks a chat message that carries a plan result card. */
export const planMarker = (planId: string) => `[plan:${planId}]`;
