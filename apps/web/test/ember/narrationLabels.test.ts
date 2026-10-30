import { describe, expect, it } from "vitest";
import { narrationLabelForStep } from "@/lib/ember/narrationLabels";
import type { AgentStepEvent } from "@perq/ai";

describe("narrationLabelForStep (D3, revised — event-driven, not scripted)", () => {
  it("maps getUserProfile tool_call to the profile-reading label", () => {
    const event: AgentStepEvent = { type: "tool_call", toolName: "getUserProfile", round: 0, args: {} };
    expect(narrationLabelForStep(event)).toBe("Ember is checking your profile");
  });

  it("maps scoreCards tool_call to a generic scoring label without a count", () => {
    const event: AgentStepEvent = { type: "tool_call", toolName: "scoreCards", round: 1, args: {} };
    expect(narrationLabelForStep(event)).toBe("Ember is comparing your cards");
  });

  it("includes the scored card count when provided", () => {
    const event: AgentStepEvent = { type: "tool_call", toolName: "scoreCards", round: 1, args: {} };
    expect(narrationLabelForStep(event, undefined, 118)).toBe("Ember compared 118 cards");
  });

  it("resolves the real card name for getCardDetails via the provided lookup", () => {
    const event: AgentStepEvent = {
      type: "tool_call",
      toolName: "getCardDetails",
      round: 2,
      args: { cardId: "axis-airtel" },
    };
    const label = narrationLabelForStep(event, (id) =>
      id === "axis-airtel" ? "Axis Airtel" : undefined
    );
    expect(label).toBe("Ember is looking up Axis Airtel");
  });

  it("falls back to a generic label when the card name can't be resolved", () => {
    const event: AgentStepEvent = {
      type: "tool_call",
      toolName: "getCardDetails",
      round: 2,
      args: { cardId: "unknown-card" },
    };
    expect(narrationLabelForStep(event, () => undefined)).toBe("Ember is looking up a card");
  });

  it("maps the final event to the writing-recommendation label", () => {
    const event: AgentStepEvent = { type: "final", round: 3 };
    expect(narrationLabelForStep(event)).toBe("Ember is writing your recommendation");
  });

  it("returns null for tool_result events and unknown tool names (no narration noise)", () => {
    const result: AgentStepEvent = { type: "tool_result", toolName: "getUserProfile", round: 0, result: {} };
    expect(narrationLabelForStep(result)).toBeNull();

    const unknownTool: AgentStepEvent = { type: "tool_call", toolName: "someOtherTool", round: 0, args: {} };
    expect(narrationLabelForStep(unknownTool)).toBeNull();
  });

  it("handles an arbitrary sequence of multiple getCardDetails calls, not a fixed script", () => {
    const cardIds = ["a", "b", "c"];
    const names: Record<string, string> = { a: "Card A", b: "Card B", c: "Card C" };
    const labels = cardIds.map((id) =>
      narrationLabelForStep(
        { type: "tool_call", toolName: "getCardDetails", round: 0, args: { cardId: id } },
        (lookupId) => names[lookupId]
      )
    );
    expect(labels).toEqual([
      "Ember is looking up Card A",
      "Ember is looking up Card B",
      "Ember is looking up Card C",
    ]);
  });
});
