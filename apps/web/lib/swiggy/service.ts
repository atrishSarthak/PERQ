import { and, eq } from "drizzle-orm";
import { db, swiggyCarts, swiggyConnections, swiggyOrders, type SwiggyCartRow, type SwiggyOrderRow } from "@perq/db";
import { formatInr, istDate } from "@perq/finance-engine";
import type { SwiggyCart, SwiggyOrder, SwiggyStatus } from "@perq/shared";
import { createSwiggyClient, swiggyMode, type CartRequestItem, type SwiggyClient } from "@perq/swiggy";
import { invalidateState, logActivity } from "@/lib/money/activity";

// Swiggy (Step 4 Lite), server side: connect, sync orders into swiggy_orders,
// prepare carts and place an order only on the user's confirmation.

export class SwiggyOrderRefused extends Error {}

const client = (now: Date): SwiggyClient => createSwiggyClient(istDate(now));

export async function swiggyStatus(userId: string): Promise<SwiggyStatus> {
  const [c] = await db.select().from(swiggyConnections).where(eq(swiggyConnections.userId, userId)).limit(1);
  return { connected: !!c, mode: c ? (c.mode === "live" ? "live" : "mock") : null, connectedAt: c?.connectedAt.toISOString() ?? null };
}

/** Pulls food and Instamart orders. Already-synced orders are kept as they are. */
export async function syncSwiggy(userId: string, now: Date): Promise<number> {
  if (!(await swiggyStatus(userId)).connected) return 0;
  const c = client(now);
  const orders = [...(await c.getFoodOrders()), ...(await c.getInstamartOrders())];
  const added = await db
    .insert(swiggyOrders)
    .values(orders.map((o) => ({ userId, externalId: o.id, service: o.service, orderedAt: new Date(o.orderedAt), restaurant: o.restaurant, items: o.items, itemTotal: o.itemTotal, fees: o.fees, total: o.total })))
    .onConflictDoNothing()
    .returning({ id: swiggyOrders.id });
  if (added.length) await invalidateState(userId);
  return added.length;
}

export async function connectSwiggy(userId: string, now: Date, mode = swiggyMode()): Promise<SwiggyStatus> {
  createSwiggyClient(istDate(now), mode); // live refuses here, before anything is saved
  await db.insert(swiggyConnections).values({ userId, mode }).onConflictDoNothing();
  const added = await syncSwiggy(userId, now);
  await logActivity(userId, "swiggy_connected", `Connected Swiggy${mode === "mock" ? " (demo data)" : ""} and read ${added} orders`);
  return swiggyStatus(userId);
}

export async function disconnectSwiggy(userId: string): Promise<void> {
  await db.delete(swiggyCarts).where(eq(swiggyCarts.userId, userId));
  await db.delete(swiggyOrders).where(eq(swiggyOrders.userId, userId));
  await db.delete(swiggyConnections).where(eq(swiggyConnections.userId, userId));
  await invalidateState(userId);
}

export const orderOf = (r: SwiggyOrderRow): SwiggyOrder => ({
  id: r.externalId,
  service: r.service === "instamart" ? "instamart" : "food",
  orderedAt: r.orderedAt.toISOString(),
  restaurant: r.restaurant,
  items: r.items as SwiggyOrder["items"],
  itemTotal: r.itemTotal,
  fees: r.fees as SwiggyOrder["fees"],
  total: r.total,
});

/** The user's synced orders for the financial state; null when Swiggy isn't connected. */
export async function loadSwiggyOrders(userId: string): Promise<SwiggyOrder[] | null> {
  if (!(await swiggyStatus(userId)).connected) return null;
  return (await db.select().from(swiggyOrders).where(eq(swiggyOrders.userId, userId))).map(orderOf);
}

export const cartOf = (r: SwiggyCartRow): SwiggyCart => ({
  id: r.id,
  budget: r.budget,
  lines: r.lines as SwiggyCart["lines"],
  itemTotal: r.itemTotal,
  fees: r.fees as SwiggyCart["fees"],
  total: r.total,
  withinBudget: r.total <= r.budget,
  skipped: r.skipped as SwiggyCart["skipped"],
  status: r.status === "placed" ? "placed" : r.status === "cancelled" ? "cancelled" : "prepared",
  orderId: r.orderId,
});

export async function searchInstamart(now: Date, query: string) {
  return (await client(now).searchProducts(query)).slice(0, 8);
}

/** Prepares (never places) a cart within budget. */
export async function prepareCart(userId: string, now: Date, req: { budget: number; items?: CartRequestItem[] | null }): Promise<SwiggyCart> {
  const planned = await client(now).buildCart(req);
  const [row] = await db
    .insert(swiggyCarts)
    .values({ userId, externalCartId: planned.cartId, budget: planned.budget, lines: planned.lines, itemTotal: planned.itemTotal, fees: planned.fees, total: planned.total, skipped: planned.skipped })
    .returning();
  return cartOf(row!);
}

export async function getCart(userId: string, cartId: string): Promise<SwiggyCart | null> {
  const [row] = await db.select().from(swiggyCarts).where(and(eq(swiggyCarts.id, cartId), eq(swiggyCarts.userId, userId))).limit(1);
  return row ? cartOf(row) : null;
}

/**
 * Places the order. Only the app's Confirm button calls this, with
 * `confirmedByUser: true` from that request; Ember's placeSwiggyOrder tool
 * can't (level 4, above what a chat run allows).
 */
export async function placeSwiggyOrder(userId: string, cartId: string, opts: { confirmedByUser: boolean; now: Date }): Promise<SwiggyCart> {
  if (opts.confirmedByUser !== true) throw new SwiggyOrderRefused("An order is placed only when you tap Confirm.");
  const [row] = await db.select().from(swiggyCarts).where(and(eq(swiggyCarts.id, cartId), eq(swiggyCarts.userId, userId))).limit(1);
  if (!row) throw new SwiggyOrderRefused("No cart with that id.");
  if (row.status !== "prepared") throw new SwiggyOrderRefused(`This cart was already ${row.status}.`);
  const c = client(opts.now);
  const { orderId } = await c.checkout(row.externalCartId);
  const [placed] = await db.update(swiggyCarts).set({ status: "placed", orderId, updatedAt: new Date() }).where(eq(swiggyCarts.id, row.id)).returning();
  const lines = row.lines as SwiggyCart["lines"];
  await db
    .insert(swiggyOrders)
    .values({ userId, externalId: orderId, service: "instamart", orderedAt: opts.now, restaurant: null, items: lines.map((l) => ({ name: `${l.name} ${l.unit}`, qty: l.qty, price: l.price })), itemTotal: row.itemTotal, fees: row.fees, total: row.total })
    .onConflictDoNothing();
  await invalidateState(userId);
  await logActivity(userId, "swiggy_order", `Placed an Instamart order${c.mode === "mock" ? " (demo)" : ""} for ${formatInr(row.total)}, after you tapped Confirm`, { table: "swiggy_carts", id: row.id });
  return cartOf(placed!);
}

export async function cancelCart(userId: string, cartId: string): Promise<SwiggyCart | null> {
  const [row] = await db
    .update(swiggyCarts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(swiggyCarts.id, cartId), eq(swiggyCarts.userId, userId), eq(swiggyCarts.status, "prepared")))
    .returning();
  return row ? cartOf(row) : getCart(userId, cartId);
}

