import { fetch as expoFetch } from "expo/fetch";
import {
  authResponseSchema,
  healthResponseSchema,
  meResponseSchema,
  type LoginRequest,
  type SignupRequest,
} from "@perq/shared";
import { API_URL } from "./config";
import { createHttp } from "./http";
import { getToken } from "./session";

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
};

export { ApiError } from "./http";
