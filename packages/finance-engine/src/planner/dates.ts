import { daysBetween } from "../state";

// Statement timing (§5.5). Calendar days are YYYY-MM-DD in IST. A purchase on
// or before a statement date is billed on that statement; after it, on the
// next one. Day 31 (or 29/30 in short months) clamps to the month's last day.

const pad = (n: number) => String(n).padStart(2, "0");
function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}
function ym(iso: string): [number, number, number] {
  return iso.split("-").map(Number) as [number, number, number];
}
/** The date in month (y, m) for a day-of-month, clamped to the month's length. */
export function dayInMonth(y: number, m: number, day: number): string {
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(day, lastDay(yy, mm)))}`;
}
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** First statement date on or after `date`. */
export function statementOn(statementDay: number, date: string): string {
  const [y, m] = ym(date);
  const thisMonth = dayInMonth(y, m, statementDay);
  return thisMonth >= date ? thisMonth : dayInMonth(y, m + 1, statementDay);
}

/** First due date strictly after a statement date. */
export function dueAfter(dueDay: number, statementDate: string): string {
  const [y, m] = ym(statementDate);
  const thisMonth = dayInMonth(y, m, dueDay);
  return thisMonth > statementDate ? thisMonth : dayInMonth(y, m + 1, dueDay);
}

export interface FloatDays {
  purchaseDate: string;
  billedOn: string;
  dueOn: string;
  /** Interest-free days: due date − purchase date. */
  days: number;
}

/** Interest-free days for a credit card purchase in full on `purchaseDate`. */
export function floatDays(card: { statementDay: number | null; dueDay: number | null }, purchaseDate: string): FloatDays | null {
  if (!card.statementDay || !card.dueDay) return null;
  const billedOn = statementOn(card.statementDay, purchaseDate);
  const dueOn = dueAfter(card.dueDay, billedOn);
  return { purchaseDate, billedOn, dueOn, days: daysBetween(purchaseDate, dueOn) };
}

export interface BestPurchaseDate {
  bestDate: string;
  floatToday: number;
  floatBest: number;
  extraDays: number;
  best: FloatDays;
  today: FloatDays;
}

/**
 * The day in [from, to] with the most interest-free days (earliest on a tie),
 * and the float on buying `from`. null without statement and due days.
 */
export function bestPurchaseDate(
  card: { statementDay: number | null; dueDay: number | null },
  from: string,
  to: string
): BestPurchaseDate | null {
  const today = floatDays(card, from);
  if (!today) return null;
  let best = today;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    const f = floatDays(card, d)!;
    if (f.days > best.days) best = f;
  }
  return { bestDate: best.purchaseDate, floatToday: today.days, floatBest: best.days, extraDays: best.days - today.days, best, today };
}
