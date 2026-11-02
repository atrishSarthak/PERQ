import { z } from "zod";
import { PERMISSION, type EmberTool } from "@perq/ai";
import type { SwiggyCart } from "@perq/shared";
import { getFinancialState } from "@/lib/money/state";
import { prepareCart, searchInstamart } from "@/lib/swiggy/service";

// Ember's Swiggy tools (Step 4 Lite). Reading is level 1; a cart is a level-3
// proposal the app shows as a card; placing the order is level 4, above what
// a chat run allows, so only the cart card's Confirm button can do it.

export interface SwiggyToolContext {
  userId: string;
  now: Date;
  onCart?: (cart: SwiggyCart) => void;
}

const itemSchema = z.object({
  query: z.string().min(1).max(40).describe('A grocery item in plain words, e.g. "milk", "atta", "eggs".'),
  qty: z.number().int().min(1).max(10).optional(),
});

export function createSwiggyTools(ctx: SwiggyToolContext) {
  // One cart card per turn.
  let shown = false;

  const getSwiggySummary: EmberTool<Record<string, never>, unknown> = {
    name: "getSwiggySummary",
    description: "This month's Swiggy picture: total spend, food vs Instamart groceries, delivery/platform fees, late-night (10 pm–5 am) food orders this month and in the last 7 days, and the food budget left.",
    input: z.object({}).strict(),
    permission: PERMISSION.OBSERVE,
    narration: "Ember looked at your Swiggy orders",
    handler: async () => {
      const state = await getFinancialState(ctx.userId, ctx.now);
      return state.swiggy ? { ...state.swiggy, daysLeftInMonth: state.month.daysLeft } : { error: "Swiggy isn't connected." };
    },
  };

  const searchInstamartTool: EmberTool<{ query: string }, unknown> = {
    name: "searchInstamart",
    description: "Search Instamart products by name; cheapest first, with unit and price in rupees.",
    input: z.object({ query: z.string().min(1).max(40) }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember searched Instamart",
    handler: async ({ query }) => ({ products: (await searchInstamart(ctx.now, query)).map(({ id, name, unit, price }) => ({ id, name, unit, price })) }),
  };

  const buildGroceryCart: EmberTool<{ budget: number; items?: z.infer<typeof itemSchema>[] }, unknown> = {
    name: "buildGroceryCart",
    description:
      "Prepare (don't order) an Instamart cart within a budget in rupees: the cheapest product for each item, skipping anything that would go over budget (fees included). Without items, a standard weekly basket. The app shows it to the user to confirm.",
    input: z.object({ budget: z.number().int().min(50).max(50_000), items: z.array(itemSchema).max(25).optional() }),
    permission: PERMISSION.PREPARE,
    narration: "Ember built an Instamart cart",
    handler: async ({ budget, items }) => {
      const cart = await prepareCart(ctx.userId, ctx.now, { budget, items });
      if (!shown) {
        shown = true;
        ctx.onCart?.(cart);
      }
      return {
        cartId: cart.id,
        budget: cart.budget,
        items: cart.lines.map((l) => `${l.qty} × ${l.name} ${l.unit}`),
        itemTotal: cart.itemTotal,
        fees: cart.fees,
        total: cart.total,
        withinBudget: cart.withinBudget,
        leftOfBudget: cart.budget - cart.total,
        skipped: cart.skipped,
        ordered: false,
      };
    },
  };

  // Listed so the model knows it exists and that it isn't its to use; the
  // runner refuses it (level 4 > a chat run's level 3) before the handler runs.
  const placeSwiggyOrder: EmberTool<{ cartId: string }, unknown> = {
    name: "placeSwiggyOrder",
    description: "Places an Instamart order. Only the user's Confirm tap in the app may do this; never call it.",
    input: z.object({ cartId: z.string() }),
    permission: PERMISSION.EXECUTE,
    narration: "Ember tried to place an order",
    handler: async () => ({ error: "Orders are placed only from the Confirm button." }),
  };

  return [getSwiggySummary, searchInstamartTool, buildGroceryCart, placeSwiggyOrder];
}
