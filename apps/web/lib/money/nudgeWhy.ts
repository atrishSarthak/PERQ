import { RULE_DESCRIPTIONS, type NudgePayload } from "@perq/finance-engine";
import type { NudgeRow } from "@perq/db";
import type { NudgeWhy } from "@perq/shared";

// "Why am I seeing this?" (§7.4): the rule's description, the numbers it
// used, and the date of the data behind it. Everything comes from the row.

const LABELS: Record<string, string> = {
  totalDue: "Total due",
  minimumDue: "Minimum due",
  dueDate: "Due date",
  daysToDue: "Days to due date",
  interest: "Interest charged",
  total: "Total",
  leadAmount: "Largest fee",
  leadName: "Largest fee type",
  utilisationPct: "Utilisation",
  balance: "Balance",
  creditLimit: "Credit limit",
  payToReach30: "Payment to get under 30%",
  daysToStatement: "Days to statement",
  statementCloses: "Statement closes",
  targetPct: "Target utilisation",
  remaining: "Spend still needed",
  annualFee: "Annual fee",
  byMonth: "By",
  topExtra: "Biggest single gap",
  betterCard: "Better card",
  categoryLabel: "Category",
  points: "Points",
  valueRupees: "Points value",
  expiring: "Points expiring",
  expiryDate: "Expiry date",
  spent: "Spent this month",
  limit: "Budget",
  daysLeft: "Days left in month",
  label: "Category",
  name: "Goal",
  saved: "Saved",
  target: "Target",
  behindBy: "Behind plan by",
  monthlyNeeded: "Needed each month",
};
const RUPEE_KEYS = new Set([
  "totalDue", "minimumDue", "interest", "total", "leadAmount", "balance", "creditLimit", "payToReach30",
  "remaining", "annualFee", "topExtra", "valueRupees", "spent", "limit", "saved", "target", "behindBy", "monthlyNeeded",
]);
const HIDDEN = new Set(["cardLabel", "statementDate", "month", "dataThrough", "level", "lineCount"]);

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function explainNudge(row: Pick<NudgeRow, "ruleId" | "payload" | "why">): NudgeWhy {
  const p = row.payload as NudgePayload;
  const figures = Object.entries(p)
    .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && typeof v !== "boolean")
    .map(([k, v]) => ({
      label: LABELS[k] ?? k,
      value:
        typeof v === "number"
          ? RUPEE_KEYS.has(k) ? inr(v) : k.endsWith("Pct") ? `${v}%` : v.toLocaleString("en-IN")
          : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? shortDate(String(v)) : String(v),
    }));
  const dataDate =
    typeof p.statementDate === "string"
      ? `From your ${p.cardLabel ?? "card"} statement dated ${shortDate(p.statementDate)}`
      : typeof p.dataThrough === "string"
        ? `From your statements up to ${shortDate(p.dataThrough)}`
        : null;
  return {
    ruleId: row.ruleId,
    description: [RULE_DESCRIPTIONS[row.ruleId], row.why].filter(Boolean).join(" "),
    figures,
    dataDate,
  };
}
