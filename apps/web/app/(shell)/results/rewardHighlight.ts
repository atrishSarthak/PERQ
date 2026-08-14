const CATEGORY_LABELS: Record<string, string> = {
  dining: "dining",
  travel: "travel",
  hotels: "hotels",
  fuel: "fuel",
  groceries: "groceries",
  ecommerce: "online shopping",
  utilities: "bill payments",
  general: "cashback",
};

/**
 * The result card's "Reward Highlight" stat, derived from the card's own
 * reward rates — grounded in real per-card data (never placeholder copy),
 * picking whichever category the card rewards best.
 */
export function getRewardHighlight(rewardRates: Record<string, number>): string {
  const entries = Object.entries(rewardRates).filter(([, rate]) => rate > 0);
  if (entries.length === 0) return "No reward category";

  const [topCategory, topRate] = entries.reduce((best, current) =>
    current[1] > best[1] ? current : best
  );

  const pct = Math.round(topRate * 1000) / 10;
  const label = CATEGORY_LABELS[topCategory] ?? topCategory;
  return `${pct}% ${label}`;
}
