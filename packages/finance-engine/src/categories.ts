// Transaction categorisation (handoff §5.5). Pure: the async parts (shared
// cache lookups, the Gemini batch for unknown merchants) are injected by the
// server. Categories are the 17 in packages/shared money.ts; this file uses
// string literals so finance-engine stays dependency-free.

export type TxnCategory =
  | "food_delivery" | "online_shopping" | "groceries" | "dining" | "fuel" | "bills" | "travel" | "upi"
  | "entertainment" | "health" | "education" | "rent" | "emi" | "fees_interest" | "cash" | "transfers" | "other";
export type TxnKind = "purchase" | "payment" | "refund" | "fee" | "interest" | "emi" | "cashback" | "other";
export type CategorySource = "rule" | "cache" | "ai" | "user";

/** Replace any full card number (13–19 digits, spaces/dashes allowed) with its last 4 (§12). */
export function stripCardNumbers(s: string): string {
  return s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 13 ? `XXXX${digits.slice(-4)}` : m;
  });
}

const GATEWAY_PREFIXES = /^(?:BBPS|PAYU|RAZ|RAZORPAY|RZP|PAYTM|PYTM|CCAVENUE|CCA|BILLDESK|BD|PG|POS|ECOM|SI|PAY|PHONEPE|GPAY|CASHFREE|CF|EBS|JUSPAY|IPAY)\s*[*\-#\/]\s*/;
const CITIES =
  /\b(?:BANGALORE|BENGALURU|MUMBAI|NEW DELHI|DELHI|GURGAON|GURUGRAM|NOIDA|PUNE|HYDERABAD|CHENNAI|KOLKATA|AHMEDABAD|JAIPUR|KOCHI|CHANDIGARH|INDORE|LUCKNOW|KORAMANGALA|HSR LAYOUT|INDIRANAGAR|ANDHERI|POWAI|FORUM MALL|SINGAPORE|STOCKHOLM|DUBLIN|LONDON|SAN FRANCISCO|USA|IN|IND)\b/g;
const COMPANY_WORDS = /\b(?:PVT|PRIVATE|PRIVA|PRIV|LTD|LIMITED|LLP|INC|CORP|CO|COMPANY|INTERNET|ONLINE|TECHNOLOGIES|TECH|SERVICES|SVCS|RETAIL|COMMERCE|MARKETPLACE|DESIGNS|INNOVATIVE|E TICKETING|PAYMENTS BANK)\b/g;

/**
 * "PAYU*ZOMATO GURGAON" → "ZOMATO"; "UPI-BLINKIT-COMMERCE PVT LTD" →
 * "BLINKIT"; "AMAZON PAY INDIA PRIVA BANGALORE" → "AMAZON PAY".
 */
export function normalizeMerchant(description: string): string {
  let s = stripCardNumbers(description).toUpperCase();
  s = s.replace(/^UPI[\s\-\/:]+/, ""); // UPI tag handled separately by isUpiLine
  s = s.replace(GATEWAY_PREFIXES, "");
  s = s.replace(/[*#\/\\|_]+/g, " ").replace(/-/g, " ");
  s = s.replace(/\b[\w.]+@\w+\b/g, " "); // UPI handles (after hyphens become spaces)
  s = s.replace(/\bXXXX\d{4}\b/g, " ");
  s = s.replace(/\b\d{4,}\b/g, " "); // references, phone numbers
  s = s.replace(/\.COM\b/g, "");
  s = s.replace(CITIES, " ").replace(COMPANY_WORDS, " ");
  s = s.replace(/\b(?:ORDER|PAYMENT FOR|PURCHASE)\b/g, " ");
  s = s.replace(/[^A-Z0-9& +]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/(?:\s+\d+)+$/, ""); // trailing store/branch numbers: "MART 22" = "MART 99"
  return s || description.trim().toUpperCase().slice(0, 40);
}

export function isUpiLine(description: string): boolean {
  return /^UPI[\s\-\/:]|\bUPI\b|@(?:YBL|OKAXIS|OKHDFCBANK|OKICICI|OKSBI|PAYTM|IBL|AXL|UPI)\b/i.test(description);
}

export function isInternational(description: string): boolean {
  return /\b(?:SINGAPORE|STOCKHOLM|DUBLIN|LONDON|SAN FRANCISCO|USA|US|GBR|SGP|IRL|NLD|AMSTERDAM|DUBAI|ARE)\b|\b(?:USD|SGD|EUR|GBP|AED)\s?\d/i.test(description);
}

/** What a line IS, before what it was spent on (§5.5 step 1). */
export function classifyKind(description: string, direction: "debit" | "credit"): TxnKind {
  const d = description.toUpperCase();
  if (direction === "credit") {
    if (/CASHBACK|CASH BACK|REWARD CREDIT/.test(d)) return "cashback";
    if (/REFUND|REVERSAL|REVERSED|RETURN/.test(d)) return "refund";
    if (/PAYMENT|THANK YOU|NEFT|IMPS|BBPS|AUTOPAY|AUTO DEBIT|RTGS|UPI CREDIT/.test(d)) return "payment";
    return "other";
  }
  if (/FINANCE CHARGE|INTEREST/.test(d)) return "interest";
  if (/\bEMI\b|EASY ?EMI|LOAN ON CARD/.test(d)) return "emi";
  if (/\bI?GST\b|\bFEES?\b|CHARGES?\b|MARKUP|SURCHARGE|PENALTY|CESS/.test(d) && !/RECHARGE/.test(d)) return "fee";
  return "purchase";
}

/** Category for lines that aren't spending, decided by kind alone. */
export function categoryForKind(kind: TxnKind): TxnCategory | null {
  switch (kind) {
    case "fee":
    case "interest":
      return "fees_interest";
    case "payment":
      return "transfers";
    case "emi":
      return "emi";
    case "cashback":
      return "other";
    default:
      return null; // purchase / refund / other: decided by merchant
  }
}

// Keyword rules on the normalised merchant (§5.5 step 2). Order matters:
// first match wins, so specific brands come before generic words.
const RULES: [RegExp, TxnCategory][] = [
  [/\b(?:SWIGGY INSTAMART|INSTAMART|BLINKIT|GROFERS|ZEPTO|BIGBASKET|BB NOW|DMART|DUNZO|JIOMART|NATURE S BASKET|MORE RETAIL|RELIANCE FRESH|SPENCERS|KIRANA|SUPERMARKET|GROCER)/, "groceries"],
  [/\b(?:SWIGGY|ZOMATO|EATSURE|FAASOS|DOMINOS|DOMINO S|PIZZA HUT|MCDONALDS|KFC|BURGER KING|BOX8)\b/, "food_delivery"],
  [/\b(?:AMAZON|FLIPKART|MYNTRA|AJIO|MEESHO|NYKAA|TATA CLIQ|CLIQ|SNAPDEAL|CROMA|RELIANCE DIGITAL|LENSKART|PURPLLE|FIRSTCRY|DECATHLON|IKEA|URBANLADDER|PEPPERFRY)/, "online_shopping"],
  [/\b(?:HPCL|BPCL|IOCL|INDIAN OIL|INDIANOIL|BHARAT PETROLEUM|HINDUSTAN PETROLEUM|SHELL|NAYARA|PETROL|FUEL|FILLING STATION)\b/, "fuel"],
  [/\b(?:AIRTEL|JIO|VODAFONE|VI |BSNL|ACT FIBERNET|HATHWAY|TATA PLAY|TATASKY|DISH TV|BESCOM|MSEB|MAHADISCOM|TATA POWER|ADANI ELECTRICITY|BSES|TNEB|ELECTRICITY|BROADBAND|WATER BILL|GAS BILL|PIPED GAS|MAHANAGAR GAS|INSURANCE PREMIUM|NETFLIX|SPOTIFY|YOUTUBE|GOOGLE PLAY|APPLE COM BILL|ITUNES|HOTSTAR|JIOCINEMA|PRIME VIDEO|RECHARGE)/, "bills"],
  [/\b(?:MAKEMYTRIP|MMT|GOIBIBO|CLEARTRIP|YATRA|EASEMYTRIP|IXIGO|IRCTC|INDIGO|INTERGLOBE|AIR INDIA|AKASA|SPICEJET|VISTARA|REDBUS|ABHIBUS|OYO|AIRBNB|BOOKING|AGODA|TAJ|MARRIOTT|HYATT|HOTEL|RESORT|UBER|OLA|RAPIDO|METRO RAIL)/, "travel"],
  [/\b(?:PVR|INOX|CINEPOLIS|BOOKMYSHOW|BMS|DISTRICT|PAYTM INSIDER|STEAM|PLAYSTATION|XBOX|DREAM11|GAMING)/, "entertainment"],
  [/\b(?:APOLLO|PHARMACY|PHARMEASY|NETMEDS|1MG|TATA 1MG|MEDPLUS|HOSPITAL|CLINIC|DIAGNOSTIC|PRACTO|CULT FIT|CULTFIT|GYM)/, "health"],
  [/\b(?:SCHOOL|COLLEGE|UNIVERSITY|UDEMY|COURSERA|BYJU|UNACADEMY|UPGRAD|TUITION|EDUCATION)/, "education"],
  [/\b(?:RENT|NOBROKER|HOUSING|NESTAWAY|CRED RENT|MAGICBRICKS)/, "rent"],
  [/\b(?:ATM|CASH WITHDRAWAL|CASH ADVANCE)/, "cash"],
  [/\b(?:CAFE|COFFEE|CHAI|STARBUCKS|RESTAURANT|BISTRO|DHABA|BAR |PUB|BREW|KITCHEN|BAKERY|DINEOUT|SOCIAL|HALDIRAM|THIRD WAVE)/, "dining"],
  [/\b(?:URBAN COMPANY|URBANCLAP)/, "other"],
];

export function ruleCategory(merchantNormalized: string): TxnCategory | null {
  for (const [re, cat] of RULES) if (re.test(` ${merchantNormalized} `)) return cat;
  return null;
}

export interface CategoriseInput {
  description: string;
  direction: "debit" | "credit";
}
export interface Categorised {
  descriptionRaw: string; // card numbers stripped
  merchantNormalized: string;
  kind: TxnKind;
  category: TxnCategory;
  categorySource: CategorySource;
  isInternational: boolean;
}

export interface CategoriseContext {
  /** This user's own recategorisations (merchant → category). Win over everything but kind. */
  userOverrides?: Map<string, TxnCategory>;
  /** Shared merchant → category cache. */
  sharedCache?: Map<string, TxnCategory>;
  /** Results from the AI batch for merchants nothing else knew. */
  aiResults?: Map<string, TxnCategory>;
}

/** Resolution order (§5.5): kind → user override → rules → shared cache → AI → other. */
export function categoriseOne(t: CategoriseInput, ctx: CategoriseContext = {}): Categorised {
  const descriptionRaw = stripCardNumbers(t.description);
  const merchantNormalized = normalizeMerchant(descriptionRaw);
  const kind = classifyKind(descriptionRaw, t.direction);
  const base = { descriptionRaw, merchantNormalized, kind, isInternational: isInternational(descriptionRaw) };

  const byKind = categoryForKind(kind);
  if (byKind) return { ...base, category: byKind, categorySource: "rule" };

  const override = ctx.userOverrides?.get(merchantNormalized);
  if (override) return { ...base, category: override, categorySource: "user" };

  const rule = ruleCategory(merchantNormalized);
  if (rule) return { ...base, category: rule, categorySource: "rule" };
  if (isUpiLine(descriptionRaw)) return { ...base, category: "upi", categorySource: "rule" };

  const cached = ctx.sharedCache?.get(merchantNormalized);
  if (cached) return { ...base, category: cached, categorySource: "cache" };

  const ai = ctx.aiResults?.get(merchantNormalized);
  if (ai) return { ...base, category: ai, categorySource: "ai" };

  return { ...base, category: "other", categorySource: "rule" };
}

/** Merchants that need the AI batch: no kind/override/rule/UPI/cache answer. */
export function merchantsNeedingAi(txns: CategoriseInput[], ctx: CategoriseContext = {}): string[] {
  const out = new Set<string>();
  for (const t of txns) {
    const c = categoriseOne(t, ctx);
    if (c.kind === "purchase" || c.kind === "refund" || c.kind === "other") {
      if (c.category === "other" && c.categorySource === "rule" && !ruleCategory(c.merchantNormalized)) out.add(c.merchantNormalized);
    }
  }
  return [...out];
}
