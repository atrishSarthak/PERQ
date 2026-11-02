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
import { Caption } from "./Bento";

// Home's top card: the Swiggy week as bars, then this month's spend by
// category from the user's statements (only statement data, never mock).

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
  fees_interest: "percent",
  cash: "banknote",
  transfers: "arrow.left.arrow.right",
};

/** "Expense groups": the month's top four categories from statements, with each one's share. */
function ExpenseGroups({ month }: { month: FinancialStateView["month"] }) {
  const t = useTheme();
  const rows = Object.entries(month.spendByCategory)
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
            From your {monthName(month.key)} statements
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

export function SpendOverview({ state, statements }: { state: FinancialStateView; statements: boolean }) {
  const t = useTheme();
  if (!state.swiggy && !statements) return null;
  return (
    <Card style={{ padding: t.spacing[5], borderRadius: 26, gap: t.spacing[5] }}>
      {state.swiggy ? <SwiggySection s={state.swiggy} daysLeft={state.month.daysLeft} /> : null}
      {statements ? (
        <View style={state.swiggy ? { borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[4] } : undefined}>
          <ExpenseGroups month={state.month} />
        </View>
      ) : null}
    </Card>
  );
}
