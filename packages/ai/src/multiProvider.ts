import { searchGroundedText, extractStructuredJson, type GroundedSearchResult } from "./webSearch";
import { searchWithFirecrawl } from "./firecrawlSearch";
import { extractStructuredJsonGroq } from "./groq";
import { isRateLimitError, isTransientServerError } from "./retry";
import type { ResponseSchema } from "./types";

// One level up from retry.ts's withModelFallback (which only hops between
// Gemini MODELS — same provider, same account). This hops PROVIDERS: only
// reached when Gemini's own model chain is fully exhausted, which for a
// grounded-search call means Gemini's Search grounding quota itself is
// out (confirmed live: shared identically across every Gemini model on
// the key, so no Gemini-only fix can route around it) — a different
// account entirely is the only thing that can. Optional by design: when a
// fallback key isn't configured, this behaves exactly like calling the
// Gemini-only function directly (same error surfaces, nothing silently
// swallowed).

function isGeminiExhausted(err: unknown): boolean {
  return isRateLimitError(err) || isTransientServerError(err);
}

export interface SearchFallbackKeys {
  geminiApiKey: string;
  firecrawlApiKey?: string;
  // Passed straight through to searchWithFirecrawl's geo-targeting (see
  // firecrawlSearch.ts) — irrelevant to the Gemini path, which never sees
  // it.
  firecrawlLocation?: string;
}

export async function searchWebWithFallback(
  query: string,
  keys: SearchFallbackKeys
): Promise<GroundedSearchResult> {
  try {
    return await searchGroundedText(keys.geminiApiKey, query);
  } catch (err) {
    if (!keys.firecrawlApiKey || !isGeminiExhausted(err)) throw err;
    console.error(
      "[searchWebWithFallback] Gemini grounding exhausted, falling back to Firecrawl:",
      err instanceof Error ? err.message : err
    );
    return await searchWithFirecrawl(keys.firecrawlApiKey, query, {
      location: keys.firecrawlLocation,
    });
  }
}

export interface ExtractionFallbackKeys {
  geminiApiKey: string;
  groqApiKey?: string;
}

export async function extractJsonWithFallback(
  prompt: string,
  schema: ResponseSchema,
  keys: ExtractionFallbackKeys
): Promise<unknown> {
  try {
    return await extractStructuredJson(keys.geminiApiKey, prompt, schema);
  } catch (err) {
    if (!keys.groqApiKey || !isGeminiExhausted(err)) throw err;
    console.error(
      "[extractJsonWithFallback] Gemini exhausted, falling back to Groq:",
      err instanceof Error ? err.message : err
    );
    return await extractStructuredJsonGroq(keys.groqApiKey, prompt, schema);
  }
}
