import type { FetchPageOptions, FetchPageResult } from "./types";

const JINA_READER_BASE = "https://r.jina.ai/";

// 8s hard per-call timeout (fits the narration budget even with a retry), 1
// retry with short backoff on a transient 429/503 — same shape as
// packages/ai/src/client.ts's retry policy, defined independently here since
// packages/fetch has zero dependency on packages/ai.
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/**
 * Fetches a URL via Jina AI Reader (r.jina.ai) and returns clean Markdown
 * content. Zero knowledge of what the URL is for — the caller (apps/web/
 * lib/goals) decides which URL to fetch and what to do with a failure.
 *
 * Jina Reader works unauthenticated at a lower free rate, or with a free
 * JINA_API_KEY for a higher rate — both paths use the same request shape,
 * just with/without an Authorization header. Requested with
 * `Accept: application/json` so a failure is a structured, parseable
 * response rather than an ambiguous plain-text error page.
 *
 * Jina and this function are only ever called from server-side code (the
 * API key, when present, never ships to a client bundle); enforcing that
 * boundary is the caller's responsibility (apps/web route handlers only).
 */
export async function fetchPage(
  url: string,
  options: FetchPageOptions = {}
): Promise<FetchPageResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: FetchPageResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;

      const response = await fetch(`${JINA_READER_BASE}${url}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const transient = isTransientStatus(response.status);
        lastError = {
          success: false,
          error: `Jina Reader returned ${response.status}`,
          transient,
        };
        if (transient && attempt < maxRetries) continue;
        return lastError;
      }

      const body = (await response.json()) as {
        code?: number;
        data?: { content?: string };
        message?: string;
      };

      if (typeof body.data?.content !== "string" || body.data.content.trim().length === 0) {
        // A 200 with no usable content (e.g. Jina's own failure signal, or
        // the target blocked the fetch) is not retryable — retrying an
        // unchanged request against the same block won't help.
        return {
          success: false,
          error: body.message ?? "Jina Reader did not return page content",
          transient: false,
        };
      }

      return { success: true, markdown: body.data.content };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = {
        success: false,
        error: isAbort ? `Timed out after ${timeoutMs}ms` : String(err),
        // A timeout is treated as transient (worth one retry) — a network
        // blip is exactly what the retry policy exists for.
        transient: isAbort,
      };
      if (isAbort && attempt < maxRetries) continue;
      return lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  return lastError ?? { success: false, error: "Unknown fetch failure", transient: false };
}
