import { fetchPage } from "@perq/fetch";
import { extractStructuredJson } from "@perq/ai";
import type { DiscoveredOffer } from "./discoverySchema";
import { precisionPriceSchema, PRECISION_PRICE_RESPONSE_SCHEMA } from "./discoverySchema";

// Bounds cost/latency: only the first N price-less offers get a real page
// fetch, never every discovered offer.
export const MAX_PRECISION_FETCHES = 3;

function buildPricePrompt(markdown: string, offerTitle: string): string {
  return `Below is the Markdown content of a page. Does it contain a real, current price for "${offerTitle}"?

If a real price is present, set found:true and extract it as a plain number (no currency symbol). Do not invent a price that isn't actually visible in the content below — if you can't find a real number, set found:false instead of guessing one.

PAGE CONTENT:
${markdown.slice(0, 30000)}`;
}

/**
 * Runs a single opportunistic fetch+extract pass ONLY on offers where
 * discovery's grounded search left price null (grounding's synthesized text
 * didn't contain a firm number for that specific listing) — offers that
 * already have a price are trusted directly and never re-fetched, keeping
 * this step bounded and avoiding a redundant fetch when grounding was
 * already precise enough.
 *
 * No retry at this call site (fetchPage itself still supports retries for
 * other callers, but 3 candidates x up to 2 attempts each would risk the
 * narration latency budget) — this is a single best-effort attempt per
 * candidate. On any failure (fetch failure, extraction failure, no price
 * found), the offer is KEPT with price still null, never discarded — it's
 * surfaced honestly in the "what MIMIR checked" transparency list as an
 * unconfirmed listing, excluded only from scoring (the caller filters on
 * price != null before scoring).
 */
export async function refinePricesWithPrecisionFetch(
  offers: DiscoveredOffer[],
  apiKey: string,
  jinaApiKey?: string
): Promise<DiscoveredOffer[]> {
  const needsFetch = offers.filter((o) => o.price === null).slice(0, MAX_PRECISION_FETCHES);
  if (needsFetch.length === 0) return offers;

  const refined = await Promise.allSettled(
    needsFetch.map(async (offer) => {
      const fetched = await fetchPage(offer.sourceUrl, {
        apiKey: jinaApiKey,
        timeoutMs: 8000,
        maxRetries: 0,
      });
      if (!fetched.success) return null;

      let raw: unknown;
      try {
        raw = await extractStructuredJson(
          apiKey,
          buildPricePrompt(fetched.markdown, offer.title),
          PRECISION_PRICE_RESPONSE_SCHEMA
        );
      } catch {
        return null;
      }

      const parsed = precisionPriceSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.found) return null;
      return { sourceUrl: offer.sourceUrl, price: parsed.data.price };
    })
  );

  const priceByUrl = new Map<string, number>();
  for (const result of refined) {
    if (result.status === "fulfilled" && result.value) {
      priceByUrl.set(result.value.sourceUrl, result.value.price);
    }
  }

  return offers.map((offer) =>
    priceByUrl.has(offer.sourceUrl) ? { ...offer, price: priceByUrl.get(offer.sourceUrl)! } : offer
  );
}
