import { z } from "zod";

// Swiggy budget & order assistant (Step 4 Lite). All money is integer rupees.

export const swiggyServiceSchema = z.enum(["food", "instamart"]);
export type SwiggyService = z.infer<typeof swiggyServiceSchema>;

export const swiggyOrderItemSchema = z.object({ name: z.string(), qty: z.number().int(), price: z.number().int() });
export const swiggyFeeSchema = z.object({ label: z.string(), amount: z.number().int() });

/** An order as a SwiggyClient returns it. `orderedAt` is an ISO instant. */
export const swiggyOrderSchema = z.object({
  id: z.string(),
  service: swiggyServiceSchema,
  orderedAt: z.string(),
  restaurant: z.string().nullable(),
  items: z.array(swiggyOrderItemSchema),
  itemTotal: z.number().int(),
  fees: z.array(swiggyFeeSchema),
  total: z.number().int(),
});
export type SwiggyOrder = z.infer<typeof swiggyOrderSchema>;

export const swiggyProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  price: z.number().int(),
  keywords: z.array(z.string()),
});
export type SwiggyProduct = z.infer<typeof swiggyProductSchema>;

export const swiggyCartLineSchema = z.object({ productId: z.string(), name: z.string(), unit: z.string(), qty: z.number().int(), price: z.number().int() });
export const swiggyCartStatusSchema = z.enum(["prepared", "placed", "cancelled"]);

/** A prepared Instamart cart. Nothing is ordered until the user taps Confirm. */
export const swiggyCartSchema = z.object({
  id: z.string(),
  budget: z.number().int(),
  lines: z.array(swiggyCartLineSchema),
  itemTotal: z.number().int(),
  fees: z.array(swiggyFeeSchema),
  total: z.number().int(),
  withinBudget: z.boolean(),
  /** Requested items left out: nothing matched, or it would have gone over budget. */
  skipped: z.array(z.object({ query: z.string(), reason: z.enum(["not_found", "over_budget"]) })),
  status: swiggyCartStatusSchema,
  orderId: z.string().nullable(),
});
export type SwiggyCart = z.infer<typeof swiggyCartSchema>;
export const swiggyCartResponseSchema = z.object({ cart: swiggyCartSchema });

/** This month's Swiggy picture, in the financial state when Swiggy is connected. */
export const swiggySummarySchema = z.object({
  month: z.string(),
  spend: z.number().int(),
  foodSpend: z.number().int(),
  groceriesSpend: z.number().int(),
  fees: z.number().int(),
  orders: z.number().int(),
  lateNightOrders: z.number().int(),
  /** Late-night (22:00–05:00 IST) food orders in the 7 days up to now. */
  lateNightWeek: z.object({ count: z.number().int(), amount: z.number().int(), latestDay: z.string().nullable() }),
  /** The food delivery budget against Swiggy food spend; null without one. */
  foodBudget: z.object({ limit: z.number().int(), left: z.number().int() }).nullable(),
});
export type SwiggySummary = z.infer<typeof swiggySummarySchema>;

export const swiggyStatusSchema = z.object({ connected: z.boolean(), mode: z.enum(["mock", "live"]).nullable(), connectedAt: z.string().nullable() });
export type SwiggyStatus = z.infer<typeof swiggyStatusSchema>;
