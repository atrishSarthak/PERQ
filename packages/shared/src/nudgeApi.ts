import { z } from "zod";

// Nudge inbox, push registration and the Expo Go local-notification fallback (handoff §7, §11).

export const nudgeItemSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  dedupeKey: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  priority: z.number(),
  cardAccountId: z.string().nullable(),
  sentAt: z.string().nullable(),
  openedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NudgeItem = z.infer<typeof nudgeItemSchema>;

export const nudgesResponseSchema = z.object({ nudges: z.array(nudgeItemSchema), unread: z.number().int() });

/** "remind" re-queues the nudge for 09:00 IST tomorrow. */
export const nudgePatchSchema = z.object({ status: z.enum(["opened", "acted", "dismissed", "remind"]) });

export const nudgeWhySchema = z.object({
  ruleId: z.string(),
  description: z.string(),
  /** Payload numbers as label/value pairs, for display. */
  figures: z.array(z.object({ label: z.string(), value: z.string() })),
  /** "From your HDFC Millennia statement dated 15 Oct", or null. */
  dataDate: z.string().nullable(),
});
export type NudgeWhy = z.infer<typeof nudgeWhySchema>;

export const pushRegisterSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[^\]]+\]$/),
  platform: z.enum(["ios", "android"]),
});

export const upcomingNudgesSchema = z.object({
  upcoming: z.array(z.object({ dedupeKey: z.string(), ruleId: z.string(), at: z.string(), title: z.string(), body: z.string() })),
});
export type UpcomingNudges = z.infer<typeof upcomingNudgesSchema>;
