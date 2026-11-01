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
]);
export type EmberEvent = z.infer<typeof emberEventSchema>;

export const chatRequestSchema = z.object({ message: z.string().trim().min(1).max(1000) });
export const chatHistoryResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(), createdAt: z.string() })),
});
