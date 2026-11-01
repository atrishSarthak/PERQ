// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extract = vi.fn();
vi.mock("@perq/ai", () => ({ extractStructuredJson: (...a: unknown[]) => extract(...a) }));

import { nudgeCopyPrompt, writeNudgeCopy } from "@/lib/money/nudgeCopy";
import { explainNudge } from "@/lib/money/nudgeWhy";

const n = {
  ruleId: "due_soon",
  payload: { cardLabel: "HDFC Millennia", totalDue: 18240, minimumDue: 912, dueDate: "2026-11-14", statementDate: "2026-10-15", daysToDue: 2, dueWeekday: "Saturday" },
  templateTitle: "HDFC Millennia bill due Saturday",
  templateBody: "Your HDFC Millennia bill of ₹18,240 is due on Saturday, 14 Nov.",
};

describe("writeNudgeCopy", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    delete process.env.GEMINI_DISABLED;
    extract.mockReset();
  });
  afterEach(() => delete process.env.GEMINI_API_KEY);

  it("uses Gemini's wording when every number is from the payload", async () => {
    extract.mockResolvedValue({ title: "Your HDFC Millennia bill is due Saturday", body: "₹18,240 is due on 14 Nov. Paying it in full keeps interest off." });
    expect(await writeNudgeCopy(n)).toMatchObject({ source: "ai", body: "₹18,240 is due on 14 Nov. Paying it in full keeps interest off." });
  });

  it("falls back to the template on an invented number, an error, or no key", async () => {
    extract.mockResolvedValue({ title: "Bill due", body: "₹18,500 is due Saturday." });
    expect(await writeNudgeCopy(n)).toMatchObject({ source: "template", body: n.templateBody });
    extract.mockRejectedValue(new Error("quota"));
    expect((await writeNudgeCopy(n)).source).toBe("template");
    delete process.env.GEMINI_API_KEY;
    expect((await writeNudgeCopy(n)).source).toBe("template");
  });

  it("sends Gemini only the rule, payload and template", () => {
    const p = nudgeCopyPrompt(n);
    expect(p).toContain(JSON.stringify(n.payload));
    expect(p).not.toMatch(/SWIGGY|transaction/i);
  });
});

describe("explainNudge", () => {
  it("lists payload figures in rupees and dates, plus the data date", () => {
    const why = explainNudge({ ruleId: "due_soon", payload: n.payload, why: "Your statement shows it." });
    expect(why.figures).toContainEqual({ label: "Total due", value: "₹18,240" });
    expect(why.figures).toContainEqual({ label: "Due date", value: "14 Nov" });
    expect(why.figures.some((f) => f.value === "HDFC Millennia")).toBe(false);
    expect(why.dataDate).toBe("From your HDFC Millennia statement dated 15 Oct");
    expect(why.description).toContain("Your statement shows it.");
  });
});
