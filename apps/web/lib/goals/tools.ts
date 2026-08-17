import type { ToolDefinition } from "@perq/ai";
import type { PaymentOptionScore } from "@perq/scoring-engine";

export interface GoalToolContext {
  goalText: string;
  options: PaymentOptionScore[]; // already sorted ascending by adjustedCost (D1)
}

const TOP_N_FOR_MODEL = 6; // token economy — the model only needs the leading candidates

/**
 * Gemini's tools during the narration call are READ-ONLY accessors over
 * already-computed data — it never searches or fetches itself during this
 * call and never re-ranks. Mirrors Feature 1's getUserProfile/scoreCards
 * tools exactly: the model calls this, receives the real numbers, and its
 * only job is to pick the final framing and write the "why," grounded
 * strictly in what this tool returns.
 */
export function createGoalTools(ctx: GoalToolContext): ToolDefinition[] {
  const getComparisonBreakdown: ToolDefinition = {
    name: "getComparisonBreakdown",
    description:
      "Returns the ranked payment options already computed for this goal (source + payment-method combinations, cheapest effective cost first). Ground your explanation only in these numbers — never invent a price, reward value, source, or offer not present here.",
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      goalText: ctx.goalText,
      options: ctx.options.slice(0, TOP_N_FOR_MODEL).map((o) => ({
        source: o.source,
        sourceUrl: o.sourceUrl,
        price: o.price,
        cardName: o.cardName,
        paymentMethod: o.paymentMethod,
        rewardValue: Math.round(o.rewardValue),
        effectiveCost: Math.round(o.effectiveCost),
        utilizationWarning: o.utilizationWarning,
        billingCycleNote: o.billingCycleNote,
        bnplNote: o.bnplNote,
      })),
    }),
  };

  return [getComparisonBreakdown];
}
