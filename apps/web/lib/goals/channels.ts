import type { GoalCategory } from "@perq/scoring-engine";

/**
 * Engineering Plan D2/§6: the fixed 6-channel, 3-category list, as a
 * TypeScript union — an arbitrary channel string is a build-time type
 * error, not a runtime convention. This is the entire guard against §17's
 * "don't quietly expand the channel list" warning; nothing else in the
 * pipeline can introduce a 7th channel without editing this file.
 */
export type Channel =
  | "bookmyshow"
  | "district"
  | "klook"
  | "getyourguide"
  | "amazon"
  | "flipkart";

export const CHANNELS_BY_CATEGORY: Record<GoalCategory, readonly [Channel, Channel]> = {
  movie: ["bookmyshow", "district"],
  attraction: ["klook", "getyourguide"],
  electronics: ["amazon", "flipkart"],
};

export const CHANNEL_DISPLAY_NAME: Record<Channel, string> = {
  bookmyshow: "BookMyShow",
  district: "District",
  klook: "Klook",
  getyourguide: "GetYourGuide",
  amazon: "Amazon",
  flipkart: "Flipkart",
};

// 2A: this is where Feature-3-specific "how do I build a search URL for
// this channel" knowledge lives — packages/fetch stays completely
// unaware of it. Entities come from D6's classification+entity-extraction
// call (movieName/attractionName/productName, city).
//
// VERIFIED against live responses during T0 (2026-08-16, real
// FIRECRAWL_API_KEY, see PERQ_Feature3_Engineering_Plan.md §13/T0):
//   - bookmyshow/district: neither site has a working text-search URL — a
//     `?q=`/`?query=` param returns either a soft-404 (bookmyshow) or the
//     exact same generic listing regardless of query content (district,
//     confirmed by comparing a real title against a nonsense string and
//     getting byte-identical output). Both DO have a real, working
//     city-wide "movies now showing" listing page instead; the extraction
//     step (D5) finds the matching title within that listing rather than
//     relying on server-side filtering — a direct application of "extract
//     by understanding meaning and layout," not a workaround.
//   - klook/getyourguide/flipkart: their query-based search URLs work
//     exactly as assumed, returning real, substantial result listings.
//   - amazon: CONFIRMED BLOCKED. `amazon.in/s?k=...` returns HTTP 200 but
//     the body is a browser-level "This site can't be reached /
//     ERR_INVALID_RESPONSE" page, consistently, including with a 3s
//     waitFor. Firecrawl still bills 1 credit for this (it faithfully
//     scraped whatever loaded, it has no way to know Amazon blocked it) —
//     D5's extraction layer must treat this kind of "successful fetch,
//     useless content" the same as a hard failure (it already does: no
//     required fields extractable → 'failed', not 'checked_empty').
//     Left in the fixed channel list per PRD §6 (not an engineering call
//     to make unilaterally) — electronics searches will realistically
//     show "couldn't check Amazon" most of the time, which is exactly the
//     honest, non-silent degradation D5/§10 were built for.
export interface GoalEntities {
  category: GoalCategory;
  city?: string | null;
  movieName?: string | null;
  attractionName?: string | null;
  productName?: string | null;
}

function encode(value: string): string {
  return encodeURIComponent(value.trim());
}

// BookMyShow's and District's city-listing URLs both take a lowercase,
// space-free city slug (verified: "mumbai" works on both; "Bangalore" is
// commonly slugged as "bengaluru" on these platforms, so that one specific
// mapping is applied — everything else is a plain lowercase/strip-spaces
// transform, not individually verified against every Indian city).
const CITY_SLUG_OVERRIDES: Record<string, string> = {
  bangalore: "bengaluru",
};

function citySlug(city: string): string {
  const normalized = city.trim().toLowerCase().replace(/\s+/g, "");
  return CITY_SLUG_OVERRIDES[normalized] ?? normalized;
}

export function buildSearchUrl(channel: Channel, entities: GoalEntities): string {
  switch (channel) {
    case "bookmyshow": {
      // No working text-search URL exists (T0 finding) — the real,
      // working pattern is a city-wide "movies now showing" listing;
      // the extraction step finds the matching title within it.
      const slug = citySlug(entities.city ?? "");
      return `https://in.bookmyshow.com/explore/movies-${slug}`;
    }
    case "district": {
      // Same T0 finding as bookmyshow — `?q=` doesn't filter at all
      // (verified byte-identical output for a real vs. nonsense query).
      const slug = citySlug(entities.city ?? "");
      return `https://www.district.in/${slug}/movies`;
    }
    case "klook": {
      const query = [entities.attractionName, entities.city].filter(Boolean).join(" ");
      return `https://www.klook.com/search/result/?query=${encode(query)}`;
    }
    case "getyourguide": {
      const query = [entities.attractionName, entities.city].filter(Boolean).join(" ");
      return `https://www.getyourguide.com/s/?q=${encode(query)}`;
    }
    case "amazon": {
      return `https://www.amazon.in/s?k=${encode(entities.productName ?? "")}`;
    }
    case "flipkart": {
      return `https://www.flipkart.com/search?q=${encode(entities.productName ?? "")}`;
    }
    default: {
      const _exhaustive: never = channel;
      throw new Error(`Unknown channel: ${String(_exhaustive)}`);
    }
  }
}
