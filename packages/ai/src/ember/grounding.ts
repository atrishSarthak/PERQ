// "Only use numbers present in tool outputs" (handoff §1.4), checked in
// code. Finds every rupee amount in Ember's text (₹1,23,456 / Rs. 500 /
// INR 500) and returns the ones that don't appear anywhere in the tool
// outputs. Used at runtime (fall back to the template on a miss) and by the
// eval suite.

const RUPEE_IN_TEXT = /(?:₹|rs\.?|inr)\s?([0-9][0-9,]*(?:\.[0-9]+)?)/gi;
const NUMBER_IN_JSON = /-?[0-9][0-9,]*(?:\.[0-9]+)?/g;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** Every number that appears in the tool outputs (raw values and formatted strings). */
export function numbersInOutputs(outputs: unknown[]): Set<number> {
  const found = new Set<number>();
  for (const o of outputs) {
    const json = JSON.stringify(o) ?? "";
    for (const m of json.matchAll(NUMBER_IN_JSON)) {
      const n = toNumber(m[0]);
      if (Number.isFinite(n)) {
        found.add(n);
        found.add(Math.abs(n)); // "−₹500" in prose vs -500 in data
      }
    }
  }
  return found;
}

/** ₹ amounts in `text` not backed by any tool output. Empty = grounded. */
export function ungroundedRupees(text: string, outputs: unknown[]): number[] {
  const allowed = numbersInOutputs(outputs);
  const misses: number[] = [];
  for (const m of text.matchAll(RUPEE_IN_TEXT)) {
    const n = toNumber(m[1]!);
    if (Number.isFinite(n) && !allowed.has(n)) misses.push(n);
  }
  return [...new Set(misses)];
}
