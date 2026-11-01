import { z } from "zod";
import { recommendationResultSchema } from "./recommendation";
import { statementDraftSchema } from "./statementApi";

// Request/response bodies for the recommender API (handoff §1.5) that
// aren't covered by the domain schemas.

/** PATCH /api/recommender/profile: change one answer. `value` is validated by
 *  merging into the stored answers and re-parsing the whole v2 schema. */
export const profilePatchSchema = z.object({
  key: z.enum([
    "cardsHeld",
    "occupation",
    "monthlyIncome",
    "monthlySpend",
    "travelPerYear",
    "feeTolerance",
    "priorities",
    "openToSecured",
  ]),
  value: z.unknown(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** PATCH /api/arsenal/:cardId */
export const arsenalPatchSchema = z.object({ held: z.boolean() });
export const arsenalResponseSchema = z.object({ cardId: z.string(), held: z.boolean() });

/** POST /api/recommender/public: score without saving (landing page). */
export const publicRecommendResponseSchema = z.object({ result: recommendationResultSchema });

/** Server-sent events from POST /api/recommender/explain and /api/ember/chat. */
export const emberEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), label: z.string() }),
  z.object({ type: z.literal("chunk"), text: z.string() }),
  z.object({ type: z.literal("explanation"), text: z.string(), source: z.string(), topCardId: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string(), code: z.string().optional() }),
  // Statement parse (§5.1): the review draft once narration finishes.
  z.object({ type: z.literal("draft"), draft: z.lazy(() => statementDraftSchema) }),
  // Money chat (§8): a level-3 proposal the user confirms in the app.
  z.object({
    type: z.literal("proposal"),
    proposal: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("budget"), total: z.number().nullable(), categories: z.record(z.number()) }),
      z.object({ kind: z.literal("goal"), name: z.string(), target: z.number(), date: z.string().nullable() }),
    ]),
  }),
]);
export type EmberEvent = z.infer<typeof emberEventSchema>;

/** `nudge:<id>` or `card:<cardAccountId>` threads (§7.4, §10); none = the main Ember thread. */
export const threadRefSchema = z.string().regex(/^(nudge|card):[A-Za-z0-9-]{1,64}$/);
export const chatRequestSchema = z.object({ message: z.string().trim().min(1).max(1000), threadRef: threadRefSchema.optional() });
export const nudgeChipSchema = z.object({
  label: z.string(),
  /** App-handled button; null sends the label as a message. */
  action: z.enum(["mark_paid", "remind_tomorrow", "upload"]).nullable(),
});
export type NudgeChip = z.infer<typeof nudgeChipSchema>;
export const chatHistoryResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(), createdAt: z.string() })),
  chips: z.array(nudgeChipSchema).optional(),
  nudge: z.object({ id: z.string(), ruleId: z.string(), title: z.string(), cardAccountId: z.string().nullable(), status: z.string() }).optional(),
});
