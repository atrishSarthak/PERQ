// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runEmber, type ModelCaller } from "@perq/ai";

// Step 4: an Instamart order is placed only by the user's Confirm tap.
// Ember's placeSwiggyOrder is refused by the runner, and the order service
// refuses any call without the Confirm flag, before touching the database.

const db = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() }));
vi.mock("@perq/db", () => ({ db, swiggyCarts: {}, swiggyConnections: {}, swiggyOrders: {}, activityEvents: {}, financialStateCache: {} }));
vi.mock("@/lib/money/state", () => ({ getFinancialState: vi.fn() }));

const { createSwiggyTools } = await import("@/lib/ember/swiggy/tools");
const { placeSwiggyOrder, SwiggyOrderRefused } = await import("@/lib/swiggy/service");

function scripted(...outputs: unknown[]): ModelCaller {
  const fn = vi.fn();
  for (const o of outputs) fn.mockResolvedValueOnce(o);
  return fn as unknown as ModelCaller;
}

describe("placeSwiggyOrder", () => {
  it("is refused when Ember calls it from chat (level 4 in a level-3 run)", async () => {
    const run = await runEmber({
      userId: "u1",
      task: "chat",
      systemPrompt: "You are Ember.",
      messages: [{ role: "user", content: "Just order it." }],
      tools: createSwiggyTools({ userId: "u1", now: new Date() }),
      maxPermission: 3, // what chatTurn allows
      callModel: scripted({ type: "function_calls", calls: [{ name: "placeSwiggyOrder", args: { cartId: "c1" } }] }, { type: "text", text: "Tap Confirm to order." }),
    });
    expect(run.steps[0]).toMatchObject({ tool: "placeSwiggyOrder", status: "refused" });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("refuses without the user's confirmation, before reading or writing anything", async () => {
    await expect(placeSwiggyOrder("u1", "c1", { confirmedByUser: false, now: new Date() })).rejects.toBeInstanceOf(SwiggyOrderRefused);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
