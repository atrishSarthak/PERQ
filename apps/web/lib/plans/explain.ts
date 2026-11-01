import { EMBER_MODEL, runEmber, type AgentRunRecord, type ModelCaller } from "@perq/ai";
import { formatDay, planTemplateExplanation, validatePlanExplanation } from "@perq/finance-engine";
import type { PlanInput, PlanResult } from "@perq/shared";

// Ember words the plan (§7.3). The engine has already decided everything;
// Gemini sees the result and the template, and its text is kept only if
// validatePlanExplanation passes. Otherwise the template is the answer.

export const PLAN_SYSTEM_PROMPT = `You are Ember, PERQ's calm money assistant for credit card users in India.
You explain a purchase plan that PERQ's engine has already worked out. You never change its verdict or numbers.

Rules:
- 2 to 4 sentences. The first sentence states the verdict and the one action, starting with the verdict words given.
- Use only numbers that appear in PLAN, written the same way the TEMPLATE writes them (₹58,400, 26 Nov, 34.2%). Never round, abbreviate (no "58k") or add up numbers yourself.
- Mention the single most important trade-off. If MISSING is not empty, say what you couldn't check.
- Talk only about how and when to pay: budget, timing, cards, EMI cost, credit limit. Never judge the item or whether it's worth buying.
- No urgency, no exclamation marks, no investment or loan advice.`;

/** The slice of the result the model sees: enough to explain, nothing it would need to compute. */
export function planPromptData(input: PlanInput, r: PlanResult) {
  const o = (x: PlanResult["recommended"]) => ({
    label: x.label,
    kind: x.kind,
    purchaseDate: formatDay(x.purchaseDate),
    effectivePrice: x.effectivePrice,
    offerDiscount: x.offerDiscount,
    rewards: x.rewards,
    extraCosts: x.extraCosts,
    netCost: x.netCost,
    savingVsUpi: x.savingVsUpi,
    interestFreeDays: x.interestFreeDays,
    dueOn: x.dueOn ? formatDay(x.dueOn) : null,
    utilisationAfterPct: x.utilisationAfterPct,
  });
  return {
    item: input.item.name,
    price: input.price,
    verdict: r.verdict,
    verdictWords: r.headline,
    recommended: o(r.recommended),
    otherOptions: r.options.filter((x) => x.id !== r.recommended.id).slice(0, 3).map(o),
    timing: r.timing ? { ...r.timing, bestDate: formatDay(r.timing.bestDate) } : null,
    credit: r.credit ? { ...r.credit, nextStatementDate: r.credit.nextStatementDate ? formatDay(r.credit.nextStatementDate) : null } : null,
    emi: r.emi ? { tenureMonths: r.emi.tenureMonths, noCost: r.emi.noCost, monthlyInstalment: r.emi.monthlyInstalment, extraCostVsFullPayment: r.emi.extraCostVsFullPayment, lines: r.emi.lines } : null,
    affordability: r.affordability,
    missing: r.missingData.map((m) => m.text),
  };
}

export interface PlanExplanation {
  text: string;
  source: "ai" | "template";
  runId: string | null;
}

export async function explainPlan(opts: {
  userId: string;
  input: PlanInput;
  result: PlanResult;
  callModel: ModelCaller | null;
  logRun?: (r: AgentRunRecord) => Promise<void>;
  task?: string;
}): Promise<PlanExplanation> {
  const template = planTemplateExplanation(opts.result);
  if (!opts.callModel) return { text: template, source: "template", runId: null };
  const data = planPromptData(opts.input, opts.result);
  try {
    const run = await runEmber({
      userId: opts.userId,
      task: opts.task ?? "plan",
      systemPrompt: PLAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `PLAN: ${JSON.stringify(data)}\n\nTEMPLATE: ${template}\n\nWrite Ember's answer.` }],
      tools: [],
      maxPermission: 1,
      callModel: opts.callModel,
      model: EMBER_MODEL,
      logRun: opts.logRun,
      fallback: () => template,
    });
    if (run.status !== "ok") return { text: template, source: "template", runId: run.runId };
    const text = run.text.trim().replace(/\s+/g, " ");
    const check = validatePlanExplanation(text, opts.result);
    if (!check.ok) {
      console.warn("plan explanation rejected", { reason: check.reason.replace(/\d[\d,.]*/g, "#") });
      return { text: template, source: "template", runId: run.runId };
    }
    return { text, source: "ai", runId: run.runId };
  } catch (err) {
    console.warn("plan explanation failed", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return { text: template, source: "template", runId: null };
  }
}
