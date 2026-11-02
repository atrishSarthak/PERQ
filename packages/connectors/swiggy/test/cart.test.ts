import { describe, expect, it } from "vitest";
import { buildGroceryCart, MOCK_PRODUCTS, MockSwiggyClient, searchProducts } from "../src";

describe("buildGroceryCart", () => {
  it("stays within budget, fees included, at every budget", () => {
    for (const budget of [150, 500, 1000, 2000, 5000]) {
      const c = buildGroceryCart(MOCK_PRODUCTS, { budget });
      expect(c.total).toBeLessThanOrEqual(budget);
      expect(c.withinBudget).toBe(true);
      expect(c.total).toBe(c.itemTotal + c.fees.reduce((s, f) => s + f.amount, 0));
      expect(c.itemTotal).toBe(c.lines.reduce((s, l) => s + l.price * l.qty, 0));
    }
  });

  it("picks the cheapest match and is deterministic", () => {
    const a = buildGroceryCart(MOCK_PRODUCTS, { budget: 2000 });
    expect(a).toEqual(buildGroceryCart(MOCK_PRODUCTS, { budget: 2000 }));
    expect(a.lines.find((l) => l.name.includes("Milk"))?.productId).toBe(searchProducts(MOCK_PRODUCTS, "milk")[0]!.id);
    expect(searchProducts(MOCK_PRODUCTS, "milk").map((p) => p.price)).toEqual([52, 56]);
  });

  it("skips what doesn't fit or doesn't exist, and says why", () => {
    // ₹104 of milk + ₹39 fees fits ₹200; the cheapest rice (₹145) then would not.
    const c = buildGroceryCart(MOCK_PRODUCTS, { budget: 200, items: [{ query: "milk", qty: 2 }, { query: "rice" }, { query: "caviar" }] });
    expect(c.skipped).toEqual([{ query: "rice", reason: "over_budget" }, { query: "caviar", reason: "not_found" }]);
    expect(c.lines).toEqual([expect.objectContaining({ productId: "milk-nandini-1l", qty: 2 })]);
  });
});

describe("MockSwiggyClient", () => {
  it("anchors the fixtures on the user's day and fakes checkout", async () => {
    const onDemoDay = new MockSwiggyClient("2026-11-22");
    const later = new MockSwiggyClient("2026-11-25");
    const [a, b] = [(await onDemoDay.getFoodOrders()).at(-1)!, (await later.getFoodOrders()).at(-1)!];
    expect(a.orderedAt).toBe("2026-11-20T19:45:00.000Z");
    expect(Date.parse(b.orderedAt) - Date.parse(a.orderedAt)).toBe(3 * 86_400_000);
    expect((await onDemoDay.checkout("mock-cart-abc")).orderId).toBe("DEMO-ABC");
  });
});
