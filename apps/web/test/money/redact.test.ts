// @vitest-environment node
import { describe, expect, it } from "vitest";
import { redactRun, redactText } from "@/lib/ember/redact";

describe("agent_runs redaction (§12)", () => {
  const run = {
    id: "r1", userId: "u1", task: "chat", model: "m", inputTokens: 1, outputTokens: 2, status: "ok" as const,
    error: "failed on ₹18,240 for SWIGGY card 4821",
    steps: [
      {
        tool: "getTransactions",
        input: { category: "food_delivery", minAmount: 5000 },
        outputSummary: JSON.stringify({ count: 3, debitTotal: 18240, rows: [{ merchant: "SWIGGY", amount: 6800 }] }),
        ms: 12, status: "ok" as const, narration: "Ember looked through 3 transactions",
      },
      { tool: "getFinancialState", input: {}, outputSummary: '{"cards":[{"totalDue":29797}]', ms: 5, status: "ok" as const, narration: null },
    ],
  };

  it("keeps tool names, durations, statuses and counts only", () => {
    const r = redactRun(run);
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/18,?240|6800|29797|SWIGGY|food_delivery|5000|4821/);
    expect(r.steps[0]).toMatchObject({ tool: "getTransactions", ms: 12, status: "ok", input: { keys: ["category", "minAmount"] } });
    expect(JSON.parse(r.steps[0]!.outputSummary)).toEqual({ keys: ["count", "debitTotal", "rows"], count: 3 });
    expect(r.steps[0]!.narration).toBe("Ember looked through 3 transactions");
  });

  it("masks amounts in free text", () => {
    expect(redactText("Pay ₹18,240 by Friday on card 4821")).toBe("Pay ₹# by Friday on card #");
  });
});
