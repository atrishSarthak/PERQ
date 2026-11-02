import { describe, expect, it } from "vitest";
import { splitCartMarker } from "../src/features/swiggy/cartMessage";

describe("splitCartMarker", () => {
  it("takes a trailing [cart:<id>] off the text and returns the cart id", () => {
    const id = "29d1a2f0-e993-4274-b5ae-cd886cd7b707";
    expect(splitCartMarker(`Your basket is ₹1,623.\n\n[cart:${id}]`)).toEqual({ text: "Your basket is ₹1,623.", cartId: id });
    expect(splitCartMarker("No cart here.")).toEqual({ text: "No cart here.", cartId: null });
  });
});
