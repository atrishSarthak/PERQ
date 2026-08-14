// Approximate real-world brand colors, keyed by issuer — the result card's
// gradient must be data-driven per card (per issuer), not a fixed palette
// reused regardless of who issues the card. Curated for the issuers in the
// current card database; any issuer not listed here (a future seeded or
// web-searched card) still gets a stable, per-issuer gradient via the
// deterministic hash fallback below rather than a single generic default.
const BANK_GRADIENTS: Record<string, { from: string; to: string }> = {
  "HDFC Bank": { from: "#15296B", to: "#8A1F2B" },
  "Axis Bank": { from: "#6E1E3D", to: "#A62639" },
  "State Bank of India": { from: "#173E7C", to: "#0B2447" },
  "ICICI Bank": { from: "#E67E22", to: "#A6321C" },
  "IDFC FIRST Bank": { from: "#8E1B2E", to: "#C0392B" },
  "Kotak Mahindra Bank": { from: "#B71C1C", to: "#5C0F0F" },
  "RBL Bank": { from: "#0F766E", to: "#0B4A44" },
  "American Express": { from: "#1F6FB2", to: "#123A5C" },
  "Standard Chartered Bank": { from: "#0B6E4F", to: "#043A40" },
  "YES Bank": { from: "#1E3A8A", to: "#0F1F4D" },
  "AU Small Finance Bank": { from: "#D7263D", to: "#7A1029" },
  "IndusInd Bank": { from: "#6B1E3A", to: "#8C6A1E" },
  HSBC: { from: "#DB0011", to: "#6E0009" },
  "Federal Bank": { from: "#0B5394", to: "#062C52" },
};

// Short wordmark text for the card visual's top-left corner — full legal
// names ("State Bank of India") don't fit next to the network mark, so this
// trims to the form the bank actually brands itself with. Built as a plain
// text lookup so an actual SVG logo can replace CardVisual's rendering path
// later without this data shape needing to change.
const BANK_LABELS: Record<string, string> = {
  "State Bank of India": "SBI",
  "IDFC FIRST Bank": "IDFC FIRST",
  "Kotak Mahindra Bank": "Kotak",
  "American Express": "Amex",
  "Standard Chartered Bank": "Standard Chartered",
  "AU Small Finance Bank": "AU Bank",
  "IndusInd Bank": "IndusInd",
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getBankGradient(issuer: string): { from: string; to: string } {
  const known = BANK_GRADIENTS[issuer];
  if (known) return known;

  const hue = hashString(issuer) % 360;
  return {
    from: `hsl(${hue}, 55%, 32%)`,
    to: `hsl(${(hue + 40) % 360}, 60%, 18%)`,
  };
}

export function getBankLabel(issuer: string): string {
  return BANK_LABELS[issuer] ?? issuer;
}

// Not a real card number — this is a recommendation product, not an issued
// account, so there is no such thing as "the user's real digits" here.
// Deterministic per cardId so a given card always shows the same masked
// digits (a stable per-card identity) instead of a shared placeholder or a
// value that changes on every render.
export function getLast4(cardId: string): string {
  return String(hashString(cardId) % 10000).padStart(4, "0");
}
