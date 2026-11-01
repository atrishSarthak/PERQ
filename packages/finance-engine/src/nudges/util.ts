import { formatInr } from "../format";
import { addMonths, daysBetween } from "../state";

export const inr = formatInr;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
export const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1]!;
/** "15 Oct" */
export const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${monthName(iso).slice(0, 3)}`;

/** End of an IST calendar day as a UTC instant. */
export function endOfIstDay(iso: string): string {
  return new Date(Date.parse(`${iso}T23:59:59+05:30`)).toISOString();
}
export const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export { addMonths, daysBetween };
