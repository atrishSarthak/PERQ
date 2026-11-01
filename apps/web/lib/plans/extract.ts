import { randomUUID } from "node:crypto";
import { EMBER_MODEL, extractStructuredJson, type AgentRunRecord, type ResponseSchema } from "@perq/ai";
import {
  emiSpecSchema,
  inferPlanCategory,
  missingForPlan,
  offerSpecSchema,
  type EmiSpec,
  type OfferSpec,
  type PartialPlanInput,
  type PlanExtractResponse,
} from "@perq/shared";

// Screenshot / chat message → an UNCONFIRMED draft (Step 3 §6). Nothing
// here is planned on: the app shows every field for the user to confirm.
// The image is passed to Gemini in memory and never written anywhere; only
// product, price, offer and EMI fields are asked for, so anything else in
// the picture (names, addresses, card numbers) has nowhere to go.

const OFFER: ResponseSchema = {
  type: "object",
  properties: {
    type: { type: "string" }, // instant_discount | cashback | no_cost_emi | coupon
    bank: { type: "string", nullable: true },
    network: { type: "string", nullable: true },
    percent: { type: "number", nullable: true },
    flat: { type: "integer", nullable: true },
    minOrder: { type: "integer", nullable: true },
    maxDiscount: { type: "integer", nullable: true },
    emiOnly: { type: "boolean", nullable: true },
    rawText: { type: "string" },
  },
  required: ["type", "rawText"],
};
const EMI: ResponseSchema = {
  type: "object",
  properties: {
    tenureMonths: { type: "integer" },
    interestRatePa: { type: "number", nullable: true },
    noCost: { type: "boolean", nullable: true },
    processingFee: { type: "integer", nullable: true },
    bankName: { type: "string", nullable: true },
  },
  required: ["tenureMonths"],
};
export const EXTRACT_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    itemName: { type: "string", nullable: true },
    price: { type: "integer", nullable: true },
    merchant: { type: "string", nullable: true },
    offers: { type: "array", items: OFFER },
    emiOptions: { type: "array", items: EMI },
  },
  required: ["offers", "emiOptions"],
};

const RULES = `Rules:
- price: the amount the buyer pays now for ONE unit, in whole rupees, after any discount already shown in the price. If no price is clearly stated, return null. Never guess or estimate a price.
- itemName: the product as a shopper would say it (brand, model, key variant), at most 80 characters. null if unclear.
- merchant: the shop or app the page belongs to (usually its name in the header), not the third-party seller.
- offers: bank offers, cashback, coupons and no-cost EMI offers that are shown. type is one of instant_discount, cashback, no_cost_emi, coupon. Copy the offer's own words into rawText. Only fill percent/flat/minOrder/maxDiscount when they're printed.
- bank: if an offer is only for one bank, wallet, pay-later product or payment app, put that name in bank (e.g. "HDFC Bank", "Kartly Pay Later"). Leave bank empty only for offers anyone can use, like a coupon code.
- emiOptions: EMI plans shown with a tenure in months. noCost true for no-cost EMI. Only include rates and fees that are printed.
- Ignore everything else: names, addresses, phone numbers, order IDs, card numbers, delivery details. Never return them.`;

export const IMAGE_PROMPT = `You read a screenshot of a product page from an Indian shopping app or website.
Return the product, its price, the shop, and any offers or EMI plans shown.
${RULES}`;

export function textPrompt(text: string): string {
  return `A user of a money app wrote this about something they want to buy. Extract what they said.
${RULES}
- merchant: only if they named a shop.

MESSAGE: ${JSON.stringify(text)}`;
}

type Raw = { itemName?: unknown; price?: unknown; merchant?: unknown; offers?: unknown; emiOptions?: unknown };
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

/** Model output → a valid draft. Anything that doesn't validate is dropped and noted. */
export function normaliseExtraction(raw: Raw, source: "screenshot" | "chat"): PlanExtractResponse {
  const notes: string[] = [];
  const name = typeof raw.itemName === "string" ? raw.itemName.trim().slice(0, 120) : "";
  const price = typeof raw.price === "number" && Number.isFinite(raw.price) && raw.price > 0 && raw.price <= 10_000_000 ? Math.round(raw.price) : undefined;
  const offers: OfferSpec[] = [];
  for (const o of Array.isArray(raw.offers) ? raw.offers.slice(0, 8) : []) {
    const parsed = offerSpecSchema.safeParse(clean(o as Record<string, unknown>));
    if (parsed.success) offers.push(parsed.data);
    else if (typeof (o as { rawText?: unknown })?.rawText === "string") notes.push(`Couldn't read the offer "${String((o as { rawText: string }).rawText).slice(0, 60)}", add it yourself if it applies.`);
  }
  const emiOptions: EmiSpec[] = [];
  for (const e of Array.isArray(raw.emiOptions) ? raw.emiOptions.slice(0, 8) : []) {
    const parsed = emiSpecSchema.safeParse(clean(e as Record<string, unknown>));
    if (parsed.success) emiOptions.push(parsed.data);
  }
  const draft: PartialPlanInput = {
    ...(name ? { item: { name, category: inferPlanCategory(name) } } : {}),
    ...(price ? { price } : {}),
    ...(typeof raw.merchant === "string" && raw.merchant.trim() ? { merchant: raw.merchant.trim().slice(0, 80) } : {}),
    offers: offers.slice(0, 5),
    emiOptions: emiOptions.slice(0, 5),
  };
  const missing = missingForPlan(draft);
  if (missing.includes("price")) notes.unshift(source === "chat" ? "You didn't mention a price. What does it cost?" : "I couldn't find a price. Please type it.");
  return { draft, missing, notes, source };
}

// ---- rules fallback for chat (Gemini off) -----------------------------------------

const AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|l)?\b|\b([\d,]+(?:\.\d+)?)\s*(k|lakh|lakhs|lac)\b|\b(\d{1,3}(?:,\d{2,3})+|\d{4,8})\b/i;

/** "₹45k", "45,000", "1.2 lakh" → rupees, only when the user wrote a number. */
export function priceFromText(text: string): number | null {
  const m = text.match(AMOUNT);
  if (!m) return null;
  const num = Number((m[1] ?? m[3] ?? m[5] ?? "").replace(/,/g, ""));
  const unit = (m[2] ?? m[4] ?? "").toLowerCase();
  const mult = unit === "k" ? 1000 : unit.startsWith("l") ? 100000 : 1;
  const n = Math.round(num * mult);
  return n > 0 && n <= 10_000_000 ? n : null;
}

export function ruleExtract(text: string): Raw {
  const price = priceFromText(text);
  const item = text
    .replace(AMOUNT, " ")
    .replace(/\b(can|could|should|shall)\s+i\s+(get|buy|afford|purchase|order)\b/gi, " ")
    .replace(/\b(i want to|i'd like to|thinking of|planning to)\s+(get|buy|purchase|order)\b/gi, " ")
    .replace(/\b(is it ok to buy|worth buying|for|at|the|a|an|this|that|new|now|please|ember)\b/gi, " ")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { itemName: item.length >= 2 ? item.slice(0, 80) : null, price, offers: [], emiOptions: [] };
}

// ---- runs ------------------------------------------------------------------------

export interface ExtractDeps {
  apiKey: string | null;
  logRun?: (r: AgentRunRecord) => Promise<void>;
  userId: string;
}

async function logged<T>(deps: ExtractDeps, task: string, fn: () => Promise<T>): Promise<T> {
  const record: AgentRunRecord = { id: randomUUID(), userId: deps.userId, task, steps: [], model: EMBER_MODEL, inputTokens: null, outputTokens: null, status: "ok", error: null };
  try {
    return await fn();
  } catch (err) {
    record.status = "fallback";
    record.error = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    throw err;
  } finally {
    await deps.logRun?.(record).catch(() => {});
  }
}

const TIMEOUT_MS = 25_000;
const withTimeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);

export async function extractFromImage(imageBase64: string, mimeType: string, deps: ExtractDeps): Promise<PlanExtractResponse> {
  if (!deps.apiKey) return { draft: { offers: [], emiOptions: [] }, missing: ["item", "price"], notes: ["Reading screenshots needs Ember's model, which is off right now. Type the details instead."], source: "screenshot" };
  const raw = await logged(deps, "plan_extract_image", () => withTimeout(extractStructuredJson(deps.apiKey!, IMAGE_PROMPT, EXTRACT_SCHEMA, undefined, { data: imageBase64, mimeType })));
  return normaliseExtraction((raw ?? {}) as Raw, "screenshot");
}

export async function extractFromText(text: string, deps: ExtractDeps): Promise<PlanExtractResponse> {
  if (!deps.apiKey) return normaliseExtraction(ruleExtract(text), "chat");
  try {
    const raw = (await logged(deps, "plan_extract_text", () => withTimeout(extractStructuredJson(deps.apiKey!, textPrompt(text), EXTRACT_SCHEMA)))) as Raw;
    // The model may only report a price the user actually wrote.
    const typed = priceFromText(text);
    if (typeof raw?.price === "number" && typed === null) raw.price = null;
    return normaliseExtraction(raw ?? {}, "chat");
  } catch {
    return normaliseExtraction(ruleExtract(text), "chat");
  }
}
