import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import type { SwiggySummary } from "@perq/shared";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useInvalidateMoney } from "@/lib/moneyQueries";
import { swiggyApi } from "@/lib/swiggyApi";
import { useTheme } from "@/theme/ThemeProvider";

/** Pulls new Swiggy orders whenever Home comes into view (Step 4: "sync on Home open"). */
export function useSwiggySyncOnFocus(connected: boolean) {
  const invalidate = useInvalidateMoney();
  useFocusEffect(
    useCallback(() => {
      if (!connected) return;
      swiggyApi
        .sync()
        .then((r) => (r.added ? invalidate() : undefined))
        .catch(() => {});
    }, [connected])
  );
}

/** Home: "Food & groceries this month" from Swiggy (Step 4). */
export function SwiggyHomeCard({ s, daysLeft }: { s: SwiggySummary; daysLeft: number }) {
  const t = useTheme();
  const b = s.foodBudget;
  const usedPct = b ? Math.min(100, Math.round((s.foodSpend / b.limit) * 100)) : null;
  return (
    <Pressable onPress={() => router.push("/ember")} accessibilityRole="button" accessibilityHint="Opens Ember to plan groceries or ask about Swiggy spending">
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="caption" tone="muted" style={{ letterSpacing: 0.8 }}>
            FOOD & GROCERIES THIS MONTH
          </Text>
          <Text variant="caption" tone="muted">
            Swiggy
          </Text>
        </View>
        <Text variant="display">{formatInr(s.spend)}</Text>
        <Text variant="small" tone="muted">
          Food {formatInr(s.foodSpend)} · Instamart {formatInr(s.groceriesSpend)} · {s.orders} orders
        </Text>
        <View style={{ flexDirection: "row", gap: t.spacing[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" tone="muted">
              DELIVERY & PLATFORM FEES
            </Text>
            <Text variant="heading">{formatInr(s.fees)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" tone="muted">
              FOOD BUDGET LEFT
            </Text>
            {b ? (
              <Text variant="heading" tone={b.left < 0 ? "danger" : "default"}>
                {formatInr(b.left)}
              </Text>
            ) : (
              <Text variant="small" tone="link">
                Set a food budget ›
              </Text>
            )}
          </View>
        </View>
        {b && usedPct !== null ? (
          <View style={{ gap: 4 }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surface2, overflow: "hidden" }}>
              <View style={{ width: `${usedPct}%`, height: 8, backgroundColor: usedPct >= 80 ? t.colors.ember : t.colors.success }} />
            </View>
            <Text variant="caption" tone="muted">
              {formatInr(s.foodSpend)} of {formatInr(b.limit)} on food delivery · {daysLeft} days left
            </Text>
          </View>
        ) : null}
        {s.lateNightWeek.count ? (
          <Text variant="small" tone="muted">
            {s.lateNightWeek.count} late-night order{s.lateNightWeek.count === 1 ? "" : "s"} in the last 7 days, {formatInr(s.lateNightWeek.amount)}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}
