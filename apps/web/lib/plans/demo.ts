import { and, eq } from "drizzle-orm";
import { db, purchasePlans } from "@perq/db";
import { planTemplateExplanation } from "@perq/finance-engine";
import type { PlanInput, Verdict } from "@perq/shared";
import { computePlan, savePlan } from "./service";

// Demo plans (Step 3 §11). Three ready plans on the demo user, each opening a
// different verdict, all computed by the real engine from the demo data:
//   1. Phone ₹59,900 with a ₹1,500 HDFC offer, needed within two weeks
//      → Go ahead, on 26 Nov (the day after the HDFC statement closes), with a reminder that day
//   2. Laptop ₹24,999 on "no-cost EMI" with a ₹199 fee → Pay a different way (true cost shown)
//   3. Trip package ₹38,000 → Better to wait, with a goal proposal
// The wording is the template (no Gemini call at demo load), so loading is instant and repeatable.

export const DEMO_PLANS: { input: PlanInput; expect: Verdict; remind?: boolean }[] = [
  {
    input: {
      item: { name: "Pixel 10 phone", category: "online_shopping" },
      price: 59900,
      merchant: "Flipkart",
      needBy: "2026-12-05",
      offers: [{ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1,500 instant discount on HDFC Bank credit cards" }],
      emiOptions: [],
    },
    expect: "go_with_timing",
    remind: true,
  },
  {
    input: {
      item: { name: "Lenovo IdeaPad laptop", category: "online_shopping" },
      price: 24999,
      merchant: "Amazon",
      offers: [],
      emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199, bankName: "Axis Bank" }],
    },
    expect: "rethink_payment",
  },
  {
    input: {
      item: { name: "Manali trip package", category: "travel" },
      price: 38000,
      merchant: "MakeMyTrip",
      offers: [],
      emiOptions: [],
    },
    expect: "wait",
  },
];

export async function insertDemoPlans(userId: string, at: Date) {
  const ids: string[] = [];
  for (const [i, p] of DEMO_PLANS.entries()) {
    const computed = await computePlan(userId, p.input, at);
    if (computed.result.verdict !== p.expect) {
      throw new Error(`Demo plan ${p.input.item.name}: expected ${p.expect}, got ${computed.result.verdict} (${computed.result.verdictReason})`);
    }
    // A minute apart, so the newest-first list shows them in the demo's order (phone on top).
    const created = new Date(at.getTime() - (i + 1) * 60_000);
    const row = await savePlan(userId, p.input, "typed", computed, { text: planTemplateExplanation(computed.result), source: "template", runId: null }, created);
    const remindAt = p.remind ? computed.result.recommended.purchaseDate : null;
    await db
      .update(purchasePlans)
      .set(remindAt ? { status: "reminder_set", remindAt } : { status: "planned" })
      .where(and(eq(purchasePlans.id, row.id), eq(purchasePlans.userId, userId)));
    ids.push(row.id);
  }
  return ids;
}
