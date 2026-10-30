import type { ZodType, ZodTypeDef } from "zod";

// Platform-free core of the API client (unit-tested without React Native):
// builds the request, attaches the Bearer token, and zod-parses the reply.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "http" | "network" | "parse" | "config"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface HttpDeps {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  getToken: () => Promise<string | null>;
  onUnauthorized?: () => void;
}

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema: ZodType<T, ZodTypeDef, unknown>;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

export function createHttp(deps: HttpDeps) {
  async function request<T>(path: string, opts: RequestOptions<T>): Promise<T> {
    if (!deps.baseUrl) {
      throw new ApiError("EXPO_PUBLIC_API_URL is not set. See docs/RUNNING.md.", 0, "config");
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.auth !== false) {
      const token = await deps.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await deps.fetch(`${deps.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      throw new ApiError(
        `Can't reach the PERQ server at ${deps.baseUrl}. ${err instanceof Error ? err.message : ""}`.trim(),
        0,
        "network"
      );
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && opts.auth !== false) deps.onUnauthorized?.();
      const message =
        json && typeof json === "object" && "error" in json && typeof json.error === "string"
          ? json.error
          : `Request failed (${res.status})`;
      throw new ApiError(message, res.status, "http");
    }

    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(`Unexpected response from ${path}`, res.status, "parse");
    }
    return parsed.data;
  }

  return { request };
}
