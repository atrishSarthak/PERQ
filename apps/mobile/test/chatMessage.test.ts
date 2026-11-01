import { describe, expect, it } from "vitest";
import { draftToInput, splitPlanMarker } from "../src/features/planner/chatMessage";

describe("planner messages in a thread", () => {
  it("splits the plan marker off a stored answer", () => {
    const id = "a925fa8b-360c-4317-9e85-975686f742ce";
    expect(splitPlanMarker(`Go ahead.\n\n[plan:${id}]`)).toEqual({ text: "Go ahead.", planId: id });
    expect(splitPlanMarker("Just text")).toEqual({ text: "Just text", planId: null });
  });

  it("hides the note kept for the model about a confirmation card", () => {
    expect(splitPlanMarker("Tap Plan it if that's right.\n\n(Showed a card to confirm: Phone, ₹9,999. Not planned until the user taps Plan it.)").text).toBe(
      "Tap Plan it if that's right."
    );
  });

  it("only turns a draft into a plan input once item and price are there", () => {
    expect(draftToInput({ item: { name: "Phone" }, offers: [], emiOptions: [] })).toBeNull();
    expect(draftToInput({ item: { name: "Noise cancelling headphones" }, price: 8999, offers: [], emiOptions: [] })).toMatchObject({ price: 8999, offers: [], emiOptions: [] });
  });
});
