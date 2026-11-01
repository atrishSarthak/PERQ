import type { AgentRunRecord, Step } from "@perq/ai";

// Log redaction (handoff §12): agent_runs and server logs keep tool names,
// durations, statuses and counts, never amounts, descriptions or inputs.

/** Masks rupee amounts and any run of 3+ digits ("₹18,240" → "₹#", "4821" → "#"). */
export function redactText(s: string): string {
  return s.replace(/₹\s?[\d,]+(\.\d+)?/g, "₹#").replace(/\d[\d,]{2,}(\.\d+)?/g, "#");
}

/** Error messages also lose upper-case words (normalised merchant names are upper case). */
function redactError(s: string): string {
  return redactText(s).replace(/\b[A-Z][A-Z0-9&*.'-]{2,}\b/g, "…").slice(0, 300);
}

/** Shape only: arrays become their length, objects their key names. */
function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return { items: v.length };
  if (v && typeof v === "object") return { keys: Object.keys(v as object) };
  return typeof v;
}

export function redactStep(step: Step): Step {
  // outputSummary is often truncated JSON, so it may not parse.
  let shape: unknown;
  try {
    shape = shapeOf(JSON.parse(step.outputSummary));
  } catch {
    shape = { truncated: true };
  }
  const count = step.outputSummary.match(/^\{"count":(\d+)/)?.[1];
  return {
    tool: step.tool,
    input: shapeOf(step.input),
    outputSummary: JSON.stringify({ ...(typeof shape === "object" ? shape : { type: shape }), ...(count ? { count: Number(count) } : {}) }),
    ms: step.ms,
    status: step.status,
    narration: step.narration ? redactText(step.narration) : null,
  };
}

export function redactRun(record: AgentRunRecord): AgentRunRecord {
  return { ...record, steps: record.steps.map(redactStep), error: record.error ? redactError(record.error) : null };
}
