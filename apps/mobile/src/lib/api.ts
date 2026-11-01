import { fetch as expoFetch } from "expo/fetch";
import { z } from "zod";
import {
  arsenalResponseSchema,
  cardListResponseSchema,
  chatHistoryResponseSchema,
  resultsResponseSchema,
  type ProfilePatch,
  type QuizAnswersV2,
  type EmberEvent,
  authResponseSchema,
  healthResponseSchema,
  meResponseSchema,
  type LoginRequest,
  type SignupRequest,
} from "@perq/shared";
import { API_URL } from "./config";
import { ApiError, createHttp } from "./http";
export { ApiError };
import { getToken } from "./session";
import { createSseParser } from "./sse";

// Typed client for the PERQ API (handoff §0.7). Every response is
// zod-parsed against the schemas in packages/shared.

let unauthorizedHandler: (() => void) | undefined;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export const http = createHttp({
  baseUrl: API_URL,
  // Wrapped, never passed bare: a detached fetch loses its `this` binding
  // ("Illegal invocation" in the web preview).
  fetch: ((input: string, init?: RequestInit) =>
    expoFetch(input, init as never)) as unknown as typeof globalThis.fetch,
  getToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export const api = {
  health: () => http.request("/api/health", { schema: healthResponseSchema, auth: false }),
  signup: (body: SignupRequest) =>
    http.request("/api/mobile/auth/signup", { method: "POST", body, schema: authResponseSchema, auth: false }),
  login: (body: LoginRequest) =>
    http.request("/api/mobile/auth/login", { method: "POST", body, schema: authResponseSchema, auth: false }),
  me: () => http.request("/api/mobile/auth/me", { schema: meResponseSchema }),
  cards: () => http.request("/api/cards", { schema: cardListResponseSchema, auth: false }),
  results: () => http.request("/api/recommender/results", { schema: resultsResponseSchema }),
  saveAnswers: (answers: QuizAnswersV2) =>
    http.request("/api/recommender/profile", { method: "PUT", body: answers, schema: resultsResponseSchema }),
  editAnswer: (patch: ProfilePatch) =>
    http.request("/api/recommender/profile", { method: "PATCH", body: patch, schema: resultsResponseSchema }),
  setHeld: (cardId: string, held: boolean) =>
    http.request(`/api/arsenal/${encodeURIComponent(cardId)}`, { method: "PATCH", body: { held }, schema: arsenalResponseSchema }),
  chatHistory: () => http.request("/api/ember/chat", { schema: chatHistoryResponseSchema }),
};

/**
 * POSTs to a streaming Ember route and calls onEvent for each server-sent
 * event as it arrives (expo/fetch streams response bodies in Expo Go).
 */
export async function streamEmber(
  path: string,
  body: unknown,
  onEvent: (e: EmberEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = await getToken();
  const res = await expoFetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = z.object({ error: z.string() }).safeParse(await res.json().catch(() => null));
    throw new ApiError(err.success ? err.data.error : `Request failed (${res.status})`, res.status, "http");
  }
  const parse = createSseParser();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const e of parse(decoder.decode(value, { stream: true }))) onEvent(e);
  }
}


