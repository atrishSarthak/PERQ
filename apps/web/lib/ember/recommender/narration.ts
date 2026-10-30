import type { EmberStepEvent } from "@perq/ai";

// Turns runEmber's step events into the narration lines the apps show
// (handoff §1.6 screen 3). Tool narration comes from each tool's template.

export const WRITING_LABEL = "Writing your recommendation";
export const WORKED_OUT_LABEL = "Worked out your yearly value for each";

export function labelsForEvent(event: EmberStepEvent): string[] {
  if (event.type === "writing") return [WRITING_LABEL];
  if (event.type !== "tool" || event.step.status !== "ok" || !event.step.narration) return [];
  return event.step.tool === "scoreCards" ? [event.step.narration, WORKED_OUT_LABEL] : [event.step.narration];
}

/** The steps to show when Gemini isn't available, so narration still appears. */
export function fallbackLabels(total: number, eligible: number): string[] {
  return ["Checked your answers", `Filtered ${total} cards to the ${eligible} you can get`, WORKED_OUT_LABEL, WRITING_LABEL];
}
