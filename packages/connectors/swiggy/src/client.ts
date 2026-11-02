import type { SwiggyOrder, SwiggyProduct } from "@perq/shared";
import foodOrders from "../../../../fixtures/swiggy/food_orders.json";
import instamartOrders from "../../../../fixtures/swiggy/instamart_orders.json";
import products from "../../../../fixtures/swiggy/products.json";
import meta from "../../../../fixtures/swiggy/meta.json";
import { buildGroceryCart, searchProducts, type CartRequestItem, type PlannedCart } from "./cart";

// One interface for Swiggy (Step 4 Lite). Only the mock exists for now: the
// live MCP client (mcp.swiggy.com, OAuth 2.1 + PKCE) is not built, see
// DECISIONS. SWIGGY_MODE=mock|live picks the client; mock is the default.

export interface SwiggyClient {
  readonly mode: "mock" | "live";
  getFoodOrders(): Promise<SwiggyOrder[]>;
  getInstamartOrders(): Promise<SwiggyOrder[]>;
  searchProducts(query: string): Promise<SwiggyProduct[]>;
  /** Prepares a cart; nothing is ordered. */
  buildCart(req: { budget: number; items?: CartRequestItem[] | null }): Promise<PlannedCart & { cartId: string }>;
  /** Places the order for a prepared cart. Callers must have the user's explicit confirmation. */
  checkout(cartId: string): Promise<{ orderId: string }>;
}

const DAY_MS = 86_400_000;

/**
 * Reads fixtures/swiggy/*.json. Order dates are shifted by whole days so the
 * fixtures' anchor day lands on `today` (the user's IST day, demo clock
 * included); on the demo date the shift is zero and the numbers are exact.
 */
export class MockSwiggyClient implements SwiggyClient {
  readonly mode = "mock" as const;
  private readonly shiftMs: number;

  constructor(today: string, private readonly newId: () => string = () => Math.random().toString(36).slice(2, 10)) {
    this.shiftMs = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${meta.anchor}T00:00:00Z`)) / DAY_MS) * DAY_MS;
  }

  private shift(orders: SwiggyOrder[]): SwiggyOrder[] {
    return orders.map((o) => ({ ...o, orderedAt: new Date(Date.parse(o.orderedAt) + this.shiftMs).toISOString() }));
  }

  async getFoodOrders() {
    return this.shift(foodOrders as SwiggyOrder[]);
  }
  async getInstamartOrders() {
    return this.shift(instamartOrders as SwiggyOrder[]);
  }
  async searchProducts(query: string) {
    return searchProducts(products as SwiggyProduct[], query);
  }
  async buildCart(req: { budget: number; items?: CartRequestItem[] | null }) {
    return { ...buildGroceryCart(products as SwiggyProduct[], req), cartId: `mock-cart-${this.newId()}` };
  }
  async checkout(cartId: string) {
    return { orderId: `DEMO-${cartId.replace(/^mock-cart-/, "").toUpperCase()}` };
  }
}

export type SwiggyMode = "mock" | "live";

export function swiggyMode(env: Record<string, string | undefined> = process.env): SwiggyMode {
  return env.SWIGGY_MODE === "live" ? "live" : "mock";
}

/** The client for SWIGGY_MODE. Live isn't built yet, so it refuses rather than pretending. */
export function createSwiggyClient(today: string, mode: SwiggyMode = swiggyMode()): SwiggyClient {
  if (mode === "live") throw new Error("SWIGGY_MODE=live isn't available yet: the live Swiggy MCP client isn't built. Use SWIGGY_MODE=mock.");
  return new MockSwiggyClient(today);
}

export const MOCK_PRODUCTS = products as SwiggyProduct[];
