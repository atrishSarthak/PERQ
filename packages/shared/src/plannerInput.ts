import type { TxnCategory } from "./money";
import type { PartialPlanInput } from "./planner";

// Plan input helpers that run on the phone and the server alike (Step 3 §6).
// Pure: no network. A pasted link is only ever read, never fetched (§2).

const CATEGORY_RULES: [RegExp, TxnCategory][] = [
  [/\b(flight|flights|hotel|trip|holiday|vacation|package|tour|resort|airbnb|train|bus ticket|visa|goa|manali|bali|dubai|thailand)\b/i, "travel"],
  [/\b(grocer(y|ies)|vegetables|fruits|bigbasket|blinkit|zepto|instamart|dmart)\b/i, "groceries"],
  [/\b(dinner|restaurant|buffet|cafe|brunch)\b/i, "dining"],
  [/\b(swiggy|zomato|food order)\b/i, "food_delivery"],
  [/\b(petrol|diesel|fuel)\b/i, "fuel"],
  [/\b(electricity|broadband|wifi|recharge|postpaid|insurance premium|dth|gas bill|water bill)\b/i, "bills"],
  [/\b(course|tuition|fees|college|school|udemy|coursera|exam)\b/i, "education"],
  [/\b(hospital|doctor|medicine|dental|surgery|pharmacy|glasses|lens|gym|physio)\b/i, "health"],
  [/\b(concert|movie|tickets?|ps5|playstation|xbox|nintendo|game|netflix|spotify|show)\b/i, "entertainment"],
  [/\b(rent|deposit)\b/i, "rent"],
  [
    /\b(phone|iphone|pixel|galaxy|oneplus|laptop|macbook|ipad|tablet|tv|television|headphones?|earbuds|airpods|watch|camera|fridge|refrigerator|washing machine|ac|air conditioner|microwave|sofa|bed|mattress|chair|table|shoes|sneakers|jacket|dress|kurta|saree|bag|amazon|flipkart|myntra|croma)\b/i,
    "online_shopping",
  ],
];

/** A category guess from the item name (rules only; the user can change it). */
export function inferPlanCategory(name: string): TxnCategory {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(name)) return cat;
  return "online_shopping";
}

/** "₹59,900" / "59900" / "59,900.00" → 59900. Rupees only; null if there's no number. */
export function parseRupeeInput(text: string): number | null {
  const m = text.replace(/[,\s₹]/g, "").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SHOPS: [RegExp, string][] = [
  [/(^|\.)amazon\.(in|com)$|(^|\.)amzn\.(in|to)$/, "Amazon"],
  [/(^|\.)flipkart\.com$|(^|\.)dl\.flipkart\.com$/, "Flipkart"],
  [/(^|\.)myntra\.com$/, "Myntra"],
  [/(^|\.)croma\.com$/, "Croma"],
  [/(^|\.)reliancedigital\.in$/, "Reliance Digital"],
  [/(^|\.)tatacliq\.com$/, "Tata CLiQ"],
  [/(^|\.)apple\.com$/, "Apple"],
  [/(^|\.)ajio\.com$/, "AJIO"],
  [/(^|\.)nykaa\.com$/, "Nykaa"],
  [/(^|\.)makemytrip\.com$/, "MakeMyTrip"],
  [/(^|\.)goibibo\.com$/, "Goibibo"],
  [/(^|\.)ikea\.com$/, "IKEA"],
];

const STOPWORDS = new Set(["p", "dp", "gp", "product", "products", "buy", "itm", "ref", "s", "www", "html", "in", "en", "online"]);

/**
 * Merchant from the hostname and a rough item name from the URL slug, e.g.
 * flipkart.com/apple-iphone-15-black-128-gb/p/itm… → Flipkart, "Apple iPhone 15 Black 128 GB".
 * The price is never in a URL we trust, so it always has to be typed.
 */
export function parseProductLink(raw: string): { merchant: string | null; itemName: string | null } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const known = SHOPS.find(([re]) => re.test(host))?.[1] ?? null;
  const merchant = known ?? (host.split(".").slice(-2, -1)[0] ?? null);
  // The longest hyphenated path segment is usually the product slug.
  const slug = url.pathname
    .split("/")
    .map((s) => decodeURIComponent(s))
    .filter((s) => /[a-z]/i.test(s) && s.includes("-") && !/^(itm|B0)[A-Za-z0-9]+$/.test(s))
    .sort((a, b) => b.length - a.length)[0];
  const words = slug
    ?.replace(/\.(html?|aspx?)$/i, "")
    .split(/[-_+]+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()) && !/^[a-z0-9]{10,}$/i.test(w))
    .slice(0, 10);
  const itemName = words?.length
    ? words
        .map((w) => (/^\d+$/.test(w) ? w : /^(gb|tb|mb|ram)$/i.test(w) ? w.toUpperCase() : /^iphone$/i.test(w) ? "iPhone" : w[0]!.toUpperCase() + w.slice(1)))
        .join(" ")
        .slice(0, 120)
    : null;
  return { merchant: merchant ? merchant[0]!.toUpperCase() + merchant.slice(1) : null, itemName };
}

/** What still needs the user before a draft can run (§2: never plan unconfirmed numbers). */
export function missingForPlan(d: PartialPlanInput): ("price" | "item")[] {
  const out: ("price" | "item")[] = [];
  if (!d.item?.name?.trim()) out.push("item");
  if (!d.price) out.push("price");
  return out;
}
