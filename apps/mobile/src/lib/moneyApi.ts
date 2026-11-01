import {
  confirmStatementResponseSchema,
  consentsResponseSchema,
  NOTICE_VERSIONS,
  nudgesResponseSchema,
  nudgeWhySchema,
  upcomingNudgesSchema,
  type ConfirmStatementRequest,
  type EmberEvent,
} from "@perq/shared";
import { z } from "zod";
import { http, streamEmber } from "./api";

// Money Manager API calls (handoff §11). Every response is zod-parsed.
export const moneyApi = {
  consents: () => http.request("/api/consents", { schema: consentsResponseSchema }),
  giveConsent: (source: "statements" | "notifications", granted: boolean) =>
    http.request("/api/consents", {
      method: "POST",
      body: { source, granted, noticeVersion: NOTICE_VERSIONS[source] },
      schema: z.object({ ok: z.boolean() }),
    }),
  confirmStatement: (body: ConfirmStatementRequest) =>
    http.request("/api/statements/confirm", { method: "POST", body, schema: confirmStatementResponseSchema }),
  nudges: () => http.request("/api/nudges", { schema: nudgesResponseSchema }),
  markNudge: (id: string, status: "opened" | "acted" | "dismissed" | "remind") =>
    http.request(`/api/nudges/${encodeURIComponent(id)}`, { method: "PATCH", body: { status }, schema: z.object({ ok: z.boolean() }) }),
  nudgeWhy: (id: string) => http.request(`/api/nudges/${encodeURIComponent(id)}/why`, { schema: nudgeWhySchema }),
  upcomingNudges: () => http.request("/api/nudges/upcoming", { schema: upcomingNudgesSchema }),
  markPaid: (cardAccountId: string) =>
    http.request(`/api/card-accounts/${encodeURIComponent(cardAccountId)}`, { method: "PATCH", body: { markPaid: true }, schema: z.object({ ok: z.boolean() }) }),
  registerPush: (token: string, platform: "ios" | "android") =>
    http.request("/api/push/register", { method: "POST", body: { token, platform }, schema: z.object({ ok: z.boolean() }) }),
  /** Streams narration then a draft (or an error with a code). */
  parseStatement: (fileBase64: string, password: string | undefined, onEvent: (e: EmberEvent) => void, signal?: AbortSignal) =>
    streamEmber("/api/statements/parse", { fileBase64, password }, onEvent, signal),
};
