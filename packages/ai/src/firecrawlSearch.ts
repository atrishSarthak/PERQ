import type { Citation, GroundedSearchResult } from "./webSearch";

// A genuinely separate search provider (not another Gemini model) — used
// as the last-resort fallback when Gemini's own Google Search grounding is
// exhausted. Grounding has its OWN quota, shared across every Gemini model
// under one API key (confirmed live: a 429 on grounding hits identically
// on gemini-flash-latest and gemini-flash-lite-latest even when plain
// non-grounded generation on both models is fine) — so no amount of
// Gemini-model-hopping (packages/ai/src/retry.ts's withModelFallback) can
// route around it. A different provider, with its own account and quota,
// is the only thing that actually can.

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";
// Lower than searchGroundedText's implicit budget (Gemini's grounding does
// its own internal multi-page synthesis in one call) since each result
// here triggers a real page scrape (scrapeOptions below) — 5 full scrapes
// per query is a heavier, slower, costlier call than a plain search.
const DEFAULT_RESULT_LIMIT = 4;
// Per-result cap, not precisionFetch.ts's 30000 — this runs up to
// DEFAULT_RESULT_LIMIT of these in ONE combined prompt, so the per-result
// budget has to leave room for the others.
const MARKDOWN_CHARS_PER_RESULT = 6000;

interface FirecrawlSearchResultItem {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: FirecrawlSearchResultItem[];
  error?: string;
}

/**
 * Shaped to match searchGroundedText's GroundedSearchResult exactly (text +
 * citations) so callers (apps/web/lib/goals/discoverPurchaseOptions.ts) can
 * treat this as a drop-in alternate source with zero changes to their own
 * prompt-building/extraction/citation-validation logic downstream — those
 * already require every extracted fact to trace back to one of `citations`,
 * which works identically regardless of which search backend produced them.
 * Firecrawl returns structured results directly (no need for a two-call
 * search-then-extract pattern the way Gemini's grounded prose does), so
 * `text` here is a synthesized research-notes block built from each
 * result's title/url/content — formatted to read the same way Gemini's
 * grounded prose does, since the downstream extraction prompt was written
 * against that shape.
 *
 * Requests scrapeOptions (real page markdown per result, not just the
 * default title+snippet) — without it, extraction has nothing but a
 * one-line description to work from, which for a purchase-listing query
 * genuinely does not contain a price. A downstream extraction step told
 * "find the price in this text" when there's no price in the text will
 * often invent a plausible-looking number rather than reliably returning
 * null (observed live: a weaker model given only snippets fabricated
 * ₹699/₹10 "prices" for an iPhone 16 search). Real page content fixes the
 * cause, not just the symptom — the extraction prompt already instructs
 * "don't invent a price," but that instruction only works if the answer is
 * actually present in what it's given.
 */
export interface FirecrawlSearchOptions {
  limit?: number;
  // Firecrawl's search ranking has no inherent geographic bias — verified
  // live: the exact same query text (even one that already says "prices in
  // INR") returned all-US retailers (apple.com, CNET, BestBuy, Gazelle)
  // without this, and real India-facing retailers (apple.com/in, Flipkart,
  // Amazon.in, Reliance Digital) WITH it. Gemini's own grounding evidently
  // has some implicit locale reasoning that made this less visible there;
  // Firecrawl's plain search ranking has none, so callers with a
  // geography-specific domain (packages/ai itself has none — this stays a
  // caller-supplied option, not a hardcoded default) need to pass this
  // explicitly.
  location?: string;
}

export async function searchWithFirecrawl(
  apiKey: string,
  query: string,
  options: FirecrawlSearchOptions = {}
): Promise<GroundedSearchResult> {
  const { limit = DEFAULT_RESULT_LIMIT, location } = options;

  const response = await fetch(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit,
      ...(location ? { location } : {}),
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Firecrawl search returned ${response.status}: ${body}`);
  }

  const body = (await response.json()) as FirecrawlSearchResponse;
  if (!body.success) {
    throw new Error(`Firecrawl search failed: ${body.error ?? "unknown error"}`);
  }

  const citations: Citation[] = [];
  const seenUris = new Set<string>();
  const blocks: string[] = [];

  for (const result of body.data ?? []) {
    if (!result.url || seenUris.has(result.url)) continue;
    seenUris.add(result.url);
    citations.push({ uri: result.url, title: result.title });

    // The scrape can fail or be skipped for a given result (blocked site,
    // timeout) even though the search hit itself succeeded — fall back to
    // the description rather than dropping the result, same
    // never-discard-on-partial-failure spirit as precisionFetch.ts.
    const content = result.markdown
      ? result.markdown.slice(0, MARKDOWN_CHARS_PER_RESULT)
      : (result.description ?? "(no content available)");

    blocks.push(`Title: ${result.title ?? "(untitled)"}\nURL: ${result.url}\nContent:\n${content}`);
  }

  return { text: blocks.join("\n\n---\n\n"), citations };
}
