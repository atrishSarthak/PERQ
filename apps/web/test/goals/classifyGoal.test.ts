import { describe, expect, it, vi } from "vitest";

const extractStructuredJsonMock = vi.fn();
vi.mock("@perq/ai", () => ({
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
}));

const { classifyGoal } = await import("@/lib/goals/classifyGoal");

describe("classifyGoal", () => {
  it("returns ok:true with entities for a fully-specified movie goal", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({
      category: "movie",
      movieName: "Oppenheimer",
      city: "Bangalore",
    });

    const result = await classifyGoal("I want to watch Oppenheimer in Bangalore", "key");
    expect(result).toEqual({
      ok: true,
      category: "movie",
      entities: { category: "movie", movieName: "Oppenheimer", city: "Bangalore" },
    });
  });

  it("returns unsupported for a goal outside the 3 categories", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({ category: "unsupported" });

    const result = await classifyGoal("help me buy groceries", "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("returns missing_info when a movie goal has no city", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({
      category: "movie",
      movieName: "Oppenheimer",
      city: null,
    });

    const result = await classifyGoal("I want to book a movie ticket", "key");
    expect(result).toEqual({ ok: false, reason: "missing_info", missingField: "city" });
  });

  it("returns missing_info when a movie goal has no movie name", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({
      category: "movie",
      movieName: null,
      city: "Bangalore",
    });

    const result = await classifyGoal("I want to book a movie ticket in Bangalore", "key");
    expect(result).toEqual({ ok: false, reason: "missing_info", missingField: "movie name" });
  });

  it("resolves an electronics goal from product name alone (no city required)", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({
      category: "electronics",
      productName: "iPhone 15",
    });

    const result = await classifyGoal("cheapest place to buy an iPhone 15", "key");
    expect(result).toEqual({
      ok: true,
      category: "electronics",
      entities: { category: "electronics", productName: "iPhone 15" },
    });
  });

  it("treats malformed model output as an honest decline, not a crash", async () => {
    extractStructuredJsonMock.mockResolvedValueOnce({ not_a_category: true });

    const result = await classifyGoal("anything", "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("treats a thrown API error as an honest decline, not a crash", async () => {
    extractStructuredJsonMock.mockRejectedValueOnce(new Error("network error"));

    const result = await classifyGoal("anything", "key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });
});
