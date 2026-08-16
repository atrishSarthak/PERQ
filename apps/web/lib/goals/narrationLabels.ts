import type { AgentStepEvent } from "@perq/ai";

/**
 * Engineering Plan D3 (Feature 1's pattern, revised) applied to Feature 3's
 * narration call — a NEW file, sibling to (not a change to)
 * apps/web/lib/mimir/narrationLabels.ts, since that file's mapping is
 * specific to Feature 1's tool names (getUserProfile, scoreCards,
 * getCardDetails). Only covers the FINAL narration call's tool events
 * (D1's getComparisonBreakdown) — the earlier deterministic steps
 * (classification, per-channel checks) are plain strings emitted directly
 * by computeGoalRecommendation.ts, not AgentStepEvents, since D2/D6 keep
 * those steps out of any model tool-calling loop entirely.
 */
export function goalNarrationLabelForStep(event: AgentStepEvent): string | null {
  if (event.type === "tool_call") {
    switch (event.toolName) {
      case "getComparisonBreakdown":
        return "MIMIR is comparing your options";
      default:
        return null;
    }
  }
  if (event.type === "final") {
    return "MIMIR is writing your recommendation";
  }
  return null;
}
