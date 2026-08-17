import { z } from "zod";
import type { ResponseSchema } from "@perq/ai";

// Mirrors apps/web/lib/mimir/cardSearchSchema.ts's discipline: sourceUrl is
// required and validated at the call site against the real citation set
// returned by the grounded search — no fact reaches scoring ungrounded.
// price is nullable: grounding's synthesized text sometimes names a real
// listing without a firm number, in which case precisionFetch.ts makes one
// bounded follow-up attempt to pin it down; never guessed here.
export const discoveredOfferSchema = z.object({
  title: z.string().min(1),
  price: z.number().positive().nullable(),
  sourceUrl: z.string().url(),
  sourceLabel: z.string().min(1),
});

export const discoveredOfferArraySchema = z.array(discoveredOfferSchema);

export type DiscoveredOffer = z.infer<typeof discoveredOfferSchema>;

export const DISCOVERY_RESPONSE_SCHEMA: ResponseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      price: { type: "number", nullable: true },
      sourceUrl: { type: "string" },
      sourceLabel: { type: "string" },
    },
    required: ["title", "sourceUrl", "sourceLabel"],
  },
};

// A real, citation-backed card/bank/payment-platform offer found during
// discovery — never surfaced unless genuinely attributable to a real
// citation URL from that same search (checked at the call site).
export const cardOfferSchema = z.object({
  note: z.string().min(1),
  citationUrl: z.string().url(),
});

export type CardOffer = z.infer<typeof cardOfferSchema>;

export const CARD_OFFER_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    note: { type: "string", nullable: true },
    citationUrl: { type: "string", nullable: true },
  },
  required: ["found"],
};

// The precision-fetch extraction step's shape — reused unchanged whether it
// took one attempt or not; discriminated so a "not found" response can
// never accidentally carry a half-populated price.
export const precisionPriceSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), price: z.number().positive() }),
]);

export type PrecisionPriceResult = z.infer<typeof precisionPriceSchema>;

export const PRECISION_PRICE_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    price: { type: "number", nullable: true },
  },
  required: ["found"],
};
