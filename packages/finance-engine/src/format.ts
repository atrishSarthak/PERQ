/**
 * Indian-style rupee formatting: ₹1,23,456 (handoff §1.6). Hand-rolled so it
 * behaves the same on Hermes (React Native), whose Intl support for en-IN
 * grouping varies by build.
 */
export function formatInr(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "−" : "";
  const digits = String(Math.abs(rounded));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${sign}₹${grouped}`;
}
