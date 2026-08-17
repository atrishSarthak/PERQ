import { describe, expect, it, vi, beforeEach } from "vitest";

const extractStructuredJsonMock = vi.fn();

vi.mock("@perq/ai", () => ({
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
}));

const { understandGoal } = await import("@/lib/goals/understandGoal");
const { MAX_CLARIFYING_ROUNDS } = await import("@/lib/goals/clarification");

beforeEach(() => {
  extractStructuredJsonMock.mockReset();
});

describe("understandGoal", () => {
  it("resolves ok:true for a legitimate, fully-specified goal", async () => {
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: true,
      category: "ecommerce",
      summary: "iPhone 15 in Bangalore",
      subject: "iPhone 15",
      location: "Bangalore",
      variant: null,
      budgetHint: null,
      needsClarification: false,
    });

    const result = await understandGoal("buy an iPhone 15 in Bangalore", [], "key");
    expect(result).toEqual({
      ok: true,
      category: "ecommerce",
      facts: {
        summary: "iPhone 15 in Bangalore",
        subject: "iPhone 15",
        location: "Bangalore",
        variant: null,
        budgetHint: null,
      },
    });
  });

  it("declines an illegitimate goal as unsupported, ignoring any category the model still returned", async () => {
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: false,
      category: "general",
      needsClarification: false,
    });

    const result = await understandGoal("what's the weather today", [], "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("asks a single clarifying question when something important is missing, below the round cap", async () => {
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: true,
      needsClarification: true,
      clarifyingQuestion: "Which city are you in?",
    });

    const result = await understandGoal("book concert tickets", [], "key");
    expect(result).toEqual({
      ok: false,
      reason: "needs_clarification",
      question: "Which city are you in?",
    });
  });

  it("never asks a 4th clarifying question once the round cap is reached, even if the model returns one", async () => {
    const transcript = Array.from({ length: MAX_CLARIFYING_ROUNDS }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: true,
      needsClarification: true,
      clarifyingQuestion: "One more thing?",
      category: "general",
      subject: "concert tickets",
      summary: "concert tickets",
    });

    const result = await understandGoal("book concert tickets", transcript, "key");
    expect(result.ok).toBe(true);
  });

  it("declines as unsupported at the round cap if the model still can't commit to a category/subject", async () => {
    const transcript = Array.from({ length: MAX_CLARIFYING_ROUNDS }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: true,
      needsClarification: true,
      clarifyingQuestion: "still unsure",
    });

    const result = await understandGoal("book concert tickets", transcript, "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("degrades to unsupported (never throws) on a malformed model response", async () => {
    extractStructuredJsonMock.mockResolvedValue({ garbage: true });

    const result = await understandGoal("buy something", [], "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("degrades to unsupported (never throws) when the underlying call fails", async () => {
    extractStructuredJsonMock.mockRejectedValue(new Error("network error"));

    const result = await understandGoal("buy something", [], "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("never invents subject/location/variant/budget the model left null", async () => {
    extractStructuredJsonMock.mockResolvedValue({
      legitimate: true,
      category: "general",
      subject: "concert tickets",
      summary: "concert tickets",
      location: null,
      variant: null,
      budgetHint: null,
      needsClarification: false,
    });

    const result = await understandGoal("book concert tickets", [], "key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.facts.location).toBeNull();
      expect(result.facts.variant).toBeNull();
      expect(result.facts.budgetHint).toBeNull();
    }
  });
});
