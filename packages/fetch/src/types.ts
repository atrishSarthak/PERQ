// packages/fetch is channel/category-agnostic (Engineering Plan 2A) — it
// knows how to fetch a URL via Firecrawl and return clean content, nothing
// about "BookMyShow" or "movies." The fixed channel list, per-channel
// search-URL construction, and the category enum all live in
// apps/web/lib/goals/channels.ts.

export interface FetchPageOptions {
  /** Firecrawl API key — read from FIRECRAWL_API_KEY by the caller (apps/web),
   * never hardcoded or read from process.env here, mirroring how
   * createGeminiModelCaller takes its key as a parameter (packages/ai). */
  apiKey: string;
  /** Hard per-call timeout in ms (Engineering Plan D4: ~8s). */
  timeoutMs?: number;
  /** Retries on a transient 429/503 only (D4) — not on a hard 4xx/parse
   * failure, which won't succeed on retry. */
  maxRetries?: number;
}

export type FetchPageResult =
  | { success: true; markdown: string }
  | { success: false; error: string; transient: boolean };
