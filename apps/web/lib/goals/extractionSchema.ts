import { z } from "zod";
import type { ResponseSchema } from "@perq/ai";

/**
 * Engineering Plan D5: the strict per-channel extraction shape, mirroring
 * cardSearchSchema.ts's "never partially nulled" discipline. A discriminated
 * union rather than one object with optional fields — found:false (D5's
 * 'checked_empty') can never accidentally carry a half-populated price/title,
 * and found:true REQUIRES price+title, so a model response missing either
 * fails zod validation and the caller treats the whole channel as 'failed'
 * (D5) rather than scoring against a guessed number.
 *
 * seller/warrantyMonths (D1's outside-voice category-asymmetry note) are
 * captured for electronics results when present, but not required — they're
 * not weighted in scorePaymentOptions yet (deferred, per D1), just carried
 * through for a future pass.
 */
export const channelExtractionSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    price: z.number().positive(),
    title: z.string().min(1),
    seller: z.string().nullable().optional(),
    warrantyMonths: z.number().nullable().optional(),
  }),
]);

export type ChannelExtractionResult = z.infer<typeof channelExtractionSchema>;

// The SDK-agnostic ResponseSchema packages/ai's extractStructuredJson needs
// (see apps/web/lib/mimir/cardSearch.ts's CARD_RESPONSE_SCHEMA for the
// established pattern) — kept separate from the zod schema above since the
// two serve different purposes: this constrains what Gemini returns, the
// zod schema validates it strictly afterward (never trust the model's own
// schema adherence claim without a second, independent check).
export const CHANNEL_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    price: { type: "number", nullable: true },
    title: { type: "string", nullable: true },
    seller: { type: "string", nullable: true },
    warrantyMonths: { type: "number", nullable: true },
  },
  required: ["found"],
};

/**
 * T0 finding (2026-08-16, live test): bookmyshow/district have no working
 * text-search URL — the real pattern is a city-wide "movies now showing"
 * listing, which shows WHICH movies are playing but not per-showtime
 * prices. Movie-category channels need a second hop: this schema is for
 * the FIRST hop (find the matching movie's own detail-page URL within the
 * listing); the existing channelExtractionSchema above is reused unchanged
 * for the SECOND hop (extract the real price from that detail page) — same
 * shape, same "never partially nulled" discipline, no new schema needed
 * for hop 2.
 */
export const movieListingExtractionSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    detailUrl: z.string().url(),
    title: z.string().min(1),
  }),
]);

export type MovieListingExtractionResult = z.infer<typeof movieListingExtractionSchema>;

export const MOVIE_LISTING_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    detailUrl: { type: "string", nullable: true },
    title: { type: "string", nullable: true },
  },
  required: ["found"],
};
