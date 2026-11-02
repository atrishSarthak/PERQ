import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { formatInr } from "@perq/finance-engine";
import type { FinancialStateView } from "@perq/shared";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { categoryLabel, monthName } from "@/features/money/components";
import { SwiggySection } from "@/features/swiggy/HomeCard";
import { useTheme } from "@/theme/ThemeProvider";
import { Bars, Caption } from "./Bento";

// Home's top card: what statements charged to the cards by month (EMI and
// fees included), the latest month's charges by category, then the Swiggy week.
// The statement half is only statement data, never mock.

const ICONS: Record<string, SFSymbol> = {
  food_delivery: "takeoutbag.and.cup.and.straw",
  online_shopping: "bag",
  groceries: "cart",
  dining: "fork.knife",
  fuel: "fuelpump",
  bills: "doc.text",
  travel: "airplane",
  upi: "indianrupeesign.circle",
  entertainment: "film",
  health: "cross.case",
  education: "book",
  rent: "house",
  emi: "calendar",
  other: "square.grid.2x2",
  fees_interest: "percent",
  cash: "banknote",
  transfers: "arrow.left.arrow.right",
};

const MONTH = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

/** Statement charges for the last 6 months as bars, the biggest in red. */
function ChargesChart({ charges }: { charges: NonNullable<FinancialStateView["charges"]> }) {
  const t = useTheme();
  const latest = charges.latest!;
  return (
    <Pressable onPress={() => router.push("/transactions" as never)} accessibilityRole="button" accessibilityHint="Opens your transactions" style={{ gap: t.spacing[2] }}>
      <View>
        <Text variant="title">{formatInr(latest.total)}</Text>
        <Caption>CHARGED TO YOUR CARDS · {monthName(latest.key).toUpperCase()}</Caption>
      </View>
      <Bars items={charges.months.map((m) => ({ key: m.key, label: MONTH(m.key), value: m.total, a11y: `${monthName(m.key)} ${formatInr(m.total)}` }))} />
    </Pressable>
  );
}

/** "Expense groups": the latest statement month's top four categories, with each one's share. */
function ExpenseGroups({ latest }: { latest: NonNullable<FinancialStateView["charges"]["latest"]> }) {
  const t = useTheme();
  const month = { key: latest.key, totalSpend: latest.total };
  const rows = Object.entries(latest.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const shown = rows.slice(0, 4);
  return (
    <View style={{ gap: t.spacing[3] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Caption>EXPENSE GROUPS</Caption>
          <Text variant="caption" tone="muted">
            From your {monthName(month.key)} statement charges
          </Text>
        </View>
        <Text variant="bodyStrong">{formatInr(month.totalSpend)}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[3] }}>
        {shown.map(([c, v]) => {
          const pct = month.totalSpend ? Math.round((v / month.totalSpend) * 100) : 0;
          return (
            <Pressable
              key={c}
              onPress={() => router.push(`/transactions?category=${c}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`${categoryLabel(c)} ${formatInr(v)}, ${pct}% of the month`}
              style={({ pressed }) => ({
                width: "47.5%",
                minHeight: 112,
                borderRadius: 20,
                padding: t.spacing[4],
                backgroundColor: t.colors.surface2,
                justifyContent: "space-between",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="bodyStrong">{formatInr(v)}</Text>
                  <Text variant="bodyStrong">{pct}%</Text>
                </View>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {categoryLabel(c)}
                </Text>
              </View>
              <SymbolView name={ICONS[c] ?? "square.grid.2x2"} tintColor={t.colors.textMuted} size={22} />
            </Pressable>
          );
        })}
      </View>
      {rows.length > shown.length ? (
        <Pressable onPress={() => router.push("/budgets")} accessibilityRole="button" hitSlop={6}>
          <Text variant="caption" tone="link">
            {rows.length - shown.length} more categories ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SpendOverview({ state }: { state: FinancialStateView }) {
  const t = useTheme();
  const latest = state.charges.latest;
  if (!state.swiggy && !latest) return null;
  const divider = { borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[4] };
  return (
    <Card style={{ padding: t.spacing[5], borderRadius: 26, gap: t.spacing[5] }}>
      {latest ? (
        <>
          <ChargesChart charges={state.charges} />
          <View style={divider}>
            <ExpenseGroups latest={latest} />
          </View>
        </>
      ) : null}
      {state.swiggy ? (
        <View style={latest ? divider : undefined}>
          <SwiggySection s={state.swiggy} daysLeft={state.month.daysLeft} />
        </View>
      ) : null}
    </Card>
  );
}
