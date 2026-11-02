import type { SwiggyProduct } from "@perq/shared";

// Instamart cart building (Step 4): deterministic, so the same request always
// gives the same cart. For each wanted item, the cheapest matching product;
// an item that would take the total (fees included) over budget is skipped.

export interface CartRequestItem {
  query: string;
  qty?: number;
}

/** "This week's groceries" when the user doesn't list items. */
export const DEFAULT_WEEKLY_BASKET: CartRequestItem[] = [
  { query: "milk", qty: 4 },
  { query: "bread", qty: 2 },
  { query: "eggs", qty: 1 },
  { query: "curd", qty: 2 },
  { query: "atta", qty: 1 },
  { query: "rice", qty: 1 },
  { query: "dal", qty: 1 },
  { query: "onion", qty: 1 },
  { query: "tomato", qty: 1 },
  { query: "potato", qty: 1 },
  { query: "spinach", qty: 1 },
  { query: "banana", qty: 1 },
  { query: "paneer", qty: 1 },
  { query: "oil", qty: 1 },
  { query: "tea", qty: 1 },
  { query: "apple", qty: 1 },
];

export const MAX_QTY = 10;

export function instamartFees(itemTotal: number): { label: string; amount: number }[] {
  if (itemTotal === 0) return [];
  return [{ label: "Handling fee", amount: 9 }, ...(itemTotal < 199 ? [{ label: "Delivery fee", amount: 30 }] : [])];
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/** Products matching a query, cheapest first (ties by id). */
export function searchProducts(products: SwiggyProduct[], query: string): SwiggyProduct[] {
  const q = norm(query).replace(/s$/, "");
  if (!q) return [];
  return products
    .filter((p) => norm(p.name).includes(q) || p.keywords.some((k) => norm(k) === q || norm(k).replace(/s$/, "") === q || q.includes(norm(k))))
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
}

export interface PlannedCart {
  budget: number;
  lines: { productId: string; name: string; unit: string; qty: number; price: number }[];
  itemTotal: number;
  fees: { label: string; amount: number }[];
  total: number;
  withinBudget: boolean;
  skipped: { query: string; reason: "not_found" | "over_budget" }[];
}

const totalOf = (itemTotal: number) => itemTotal + instamartFees(itemTotal).reduce((s, f) => s + f.amount, 0);

export function buildGroceryCart(products: SwiggyProduct[], req: { budget: number; items?: CartRequestItem[] | null }): PlannedCart {
  const wanted = req.items?.length ? req.items : DEFAULT_WEEKLY_BASKET;
  const lines: PlannedCart["lines"] = [];
  const skipped: PlannedCart["skipped"] = [];
  let itemTotal = 0;
  for (const w of wanted) {
    const p = searchProducts(products, w.query)[0];
    if (!p) {
      skipped.push({ query: w.query, reason: "not_found" });
      continue;
    }
    // As many of the wanted quantity as fit; none at all is "over budget".
    let qty = Math.min(Math.max(1, Math.round(w.qty ?? 1)), MAX_QTY);
    while (qty > 0 && totalOf(itemTotal + p.price * qty) > req.budget) qty--;
    if (qty === 0) {
      skipped.push({ query: w.query, reason: "over_budget" });
      continue;
    }
    const same = lines.find((l) => l.productId === p.id);
    if (same) same.qty += qty;
    else lines.push({ productId: p.id, name: p.name, unit: p.unit, qty, price: p.price });
    itemTotal += p.price * qty;
  }
  const fees = instamartFees(itemTotal);
  const total = totalOf(itemTotal);
  return { budget: req.budget, lines, itemTotal, fees, total, withinBudget: total <= req.budget, skipped };
}
