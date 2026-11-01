import {
  confirmStatementResponseSchema,
  consentsResponseSchema,
  NOTICE_VERSIONS,
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
  /** Streams narration then a draft (or an error with a code). */
  parseStatement: (fileBase64: string, password: string | undefined, onEvent: (e: EmberEvent) => void, signal?: AbortSignal) =>
    streamEmber("/api/statements/parse", { fileBase64, password }, onEvent, signal),
};
