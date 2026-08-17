// packages/fetch is channel/category-agnostic (Feature 3 v2, 2A discipline
// carried forward) — it knows how to fetch a URL via Jina Reader and return
// clean content, nothing about "BookMyShow"/"movies" or any fixed source
// list. Callers (apps/web/lib/goals) decide which URL to fetch and why.

export interface FetchPageOptions {
  /** Jina Reader API key — optional; unauthenticated requests to r.jina.ai
   * work at a lower free rate. Read from JINA_API_KEY by the caller
   * (apps/web), never hardcoded or read from process.env here, mirroring
   * how createGeminiModelCaller takes its key as a parameter (packages/ai). */
  apiKey?: string;
  /** Hard per-call timeout in ms (~8s default). */
  timeoutMs?: number;
  /** Retries on a transient 429/503 only — not on a hard 4xx/parse
   * failure, which won't succeed on retry. */
  maxRetries?: number;
}

export type FetchPageResult =
  | { success: true; markdown: string }
  | { success: false; error: string; transient: boolean };
