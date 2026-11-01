import { z } from "zod";
import { PERMISSION, type EmberTool } from "@perq/ai";
import { addDays, PlanChoiceError, planPurchase, planTemplateExplanation, type PlanContext } from "@perq/finance-engine";
import type { PartialPlanInput, PlanInput, PlanResult } from "@perq/shared";
export { compactResult };
import { extractFromText, type ExtractDeps } from "@/lib/plans/extract";
import { compactResult } from "./compact";
import { getPlanRow, listPlans, planInputOf, toSummary } from "@/lib/plans/service";

// Ember's planner tools (Step 3 §7.1), all level 1. There is deliberately no
// tool that runs a plan from numbers the model read in chat: those go to the
// user as a confirmation card (planConfirm), and the plan runs only when they
// tap it (§2: never plan on unconfirmed numbers). What-ifs start from a plan
// the user already confirmed and are never saved.

export interface PlanToolContext {
  userId: string;
  extract: ExtractDeps;
  /** Plan context as of the user's day, loaded once per turn on first use. */
  loadCtx: () => Promise<PlanContext>;
  onPlanConfirm?: (draft: PartialPlanInput, missing: ("price" | "item")[]) => void;
}

const changesSchema = z
  .object({
    price: z.number().int().min(1).max(10_000_000).optional(),
    cardAccountId: z.string().optional().describe('A cardAccountId from the plan\'s options, or "upi".'),
    purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    waitDays: z.number().int().min(1).max(120).optional().describe("Buy this many days from today instead (e.g. 30 for 'wait a month')."),
    emiTenure: z.number().int().min(1).max(60).optional().describe("One of the plan's own EMI tenures."),
  })
  .strict();
type Changes = z.infer<typeof changesSchema>;

export function createPlanTools(ctx: PlanToolContext) {
  // One confirmation card per turn.
  let shown = false;
  let planCtx: PlanContext | null = null;
  const loadCtx = async () => (planCtx ??= await ctx.loadCtx());

  const extractPlanFromMessage: EmberTool<{ text: string }, unknown> = {
    name: "extractPlanFromMessage",
    description:
      "When the user asks whether or how to buy something, read the item, price, shop, offers and EMI options from their message. Nothing is planned yet: the app shows the user a card to confirm these details, and the plan runs only when they tap it.",
    input: z.object({ text: z.string().min(1).max(1000).describe("The user's message about the purchase, in their words.") }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember read the purchase details",
    handler: async ({ text }) => {
      const out = await extractFromText(text, ctx.extract);
      if (!shown) {
        shown = true;
        ctx.onPlanConfirm?.(out.draft, out.missing);
      }
      return {
        draft: out.draft,
        missing: out.missing,
        next: out.missing.includes("price")
          ? "Ask the user for the price. Don't guess it."
          : "In one short sentence, say what you read (item and price) and ask them to tap Plan it if it's right. Don't give a verdict yet.",
      };
    },
  };

  const listPlansTool: EmberTool<Record<string, never>, unknown> = {
    name: "listPlans",
    description: "The user's purchase plans, newest first: item, price, status, verdict and reminder day.",
    input: z.object({}).strict(),
    permission: PERMISSION.OBSERVE,
    narration: "Ember looked at your plans",
    handler: async () => ({ plans: (await listPlans(ctx.userId)).slice(0, 20).map(toSummary) }),
  };

  const getPlan: EmberTool<{ planId: string }, unknown> = {
    name: "getPlan",
    description: "One saved plan: the confirmed input (item, price, offers, EMI options) and its result as saved.",
    input: z.object({ planId: z.string().uuid() }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember opened your plan",
    handler: async ({ planId }) => {
      const row = await getPlanRow(ctx.userId, planId);
      if (!row) return { error: "No plan with that id." };
      const result = row.result as PlanResult | null;
      return { plan: toSummary(row), input: planInputOf(row), result: result ? compactResult(result) : null };
    },
  };

  const whatIfPlan: EmberTool<{ planId: string; changes: Changes }, unknown> = {
    name: "whatIfPlan",
    description:
      "Re-run a saved plan with a change, on today's numbers, without saving: a different price, card (cardAccountId or \"upi\"), day, waitDays (e.g. 30 to wait a month), or one of the plan's own EMI tenures. Returns the new verdict and numbers.",
    input: z.object({ planId: z.string().uuid(), changes: changesSchema }),
    permission: PERMISSION.OBSERVE,
    narration: "Ember tried your what-if",
    handler: async ({ planId, changes }) => {
      const row = await getPlanRow(ctx.userId, planId);
      if (!row) return { error: "No plan with that id." };
      const c = await loadCtx();
      const { price, waitDays, ...choice } = changes;
      const input: PlanInput = { ...planInputOf(row), ...(price ? { price } : {}) };
      if (waitDays) choice.purchaseDate = addDays(c.today, waitDays);
      try {
        const r = planPurchase(input, c, choice);
        return { notSaved: true, result: compactResult(r), template: planTemplateExplanation(r) };
      } catch (err) {
        if (err instanceof PlanChoiceError) return { error: err.message };
        throw err;
      }
    },
  };

  return [extractPlanFromMessage, listPlansTool, getPlan, whatIfPlan];
}
