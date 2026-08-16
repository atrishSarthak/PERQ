import type { FetchPageOptions, FetchPageResult } from "./types";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

// Engineering Plan D4: 8s hard per-channel timeout (fits the 10-30s total
// narration budget even with a retry, per §10), 1 retry with short backoff
// on a transient 429/503 — same shape as packages/ai/src/client.ts's
// MAX_TRANSIENT_RETRIES/RETRY_BASE_DELAY_MS, defined independently here
// since packages/fetch has zero dependency on packages/ai (2A).
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
 * Fetches a URL via Firecrawl's scrape endpoint and returns clean Markdown
 * content. Zero knowledge of what the URL is for — the caller (apps/web/
 * lib/goals) builds the actual per-channel search URL and decides what to
 * do with a failure (Engineering Plan D5's three-way outcome taxonomy is a
 * caller concern, not this function's — this function only distinguishes
 * "succeeded" from "failed, and here's whether retrying might help").
 *
 * Firecrawl and this function are only ever called from server-side code
 * (PRD §3 — the API key never ships to a client bundle); enforcing that
 * boundary is the caller's responsibility (apps/web route handlers only).
 */
export async function fetchPage(
  url: string,
  options: FetchPageOptions
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
      const response = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const transient = isTransientStatus(response.status);
        lastError = {
          success: false,
          error: `Firecrawl returned ${response.status}`,
          transient,
        };
        if (transient && attempt < maxRetries) continue;
        return lastError;
      }

      const body = (await response.json()) as {
        success?: boolean;
        data?: { markdown?: string };
        error?: string;
      };

      if (!body.success || typeof body.data?.markdown !== "string") {
        // A 200 with success:false (Firecrawl's own failure signal, e.g.
        // the target blocked the fetch) is not retryable — retrying an
        // unchanged request against the same block won't help.
        return {
          success: false,
          error: body.error ?? "Firecrawl scrape did not return markdown content",
          transient: false,
        };
      }

      return { success: true, markdown: body.data.markdown };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = {
        success: false,
        error: isAbort ? `Timed out after ${timeoutMs}ms` : String(err),
        // A timeout is treated as transient (worth one retry) — a network
        // blip is exactly what D4's retry policy exists for.
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
