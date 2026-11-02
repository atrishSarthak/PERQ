import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import type { SwiggySummary } from "@perq/shared";
import { Text } from "@/components/Text";
import { Bars, Caption, Meter, Tile } from "@/features/home/Bento";
import { useInvalidateMoney } from "@/lib/moneyQueries";
import { swiggyApi, useSwiggyConnection } from "@/lib/swiggyApi";
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

const DAY = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

/** Home: "Food & groceries this month" from Swiggy (Step 4), with the last 7 days as bars. Sits at the top of SpendOverview. */
export function SwiggySection({ s, daysLeft }: { s: SwiggySummary; daysLeft: number }) {
  const t = useTheme();
  const b = s.foodBudget;
  const usedPct = b ? Math.min(100, Math.round((s.foodSpend / b.limit) * 100)) : null;
  const week = s.last7Days.reduce((sum, d) => sum + d.total, 0);
  return (
    <Pressable onPress={() => router.push("/ember")} accessibilityRole="button" accessibilityHint="Opens Ember to plan groceries or ask about Swiggy spending" style={{ gap: t.spacing[3] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: t.spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{formatInr(week)}</Text>
          <Caption>SWIGGY · LAST 7 DAYS</Caption>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Caption>THIS MONTH</Caption>
          <Text variant="bodyStrong">{formatInr(s.spend)}</Text>
          <Text variant="caption" tone="muted">
            {formatInr(s.fees)} in fees
          </Text>
        </View>
      </View>
      <Bars items={s.last7Days.map((d) => ({ key: d.date, label: DAY(d.date), value: d.total, a11y: `${DAY(d.date)} ${formatInr(d.total)}` }))} />
      {b && usedPct !== null ? (
        <View style={{ gap: 4 }}>
          <Meter pct={usedPct} color={usedPct >= 80 ? t.colors.ember : t.colors.success} />
          <Text variant="caption" tone={b.left < 0 ? "danger" : "muted"}>
            {formatInr(b.left)} food budget left · {formatInr(s.foodSpend)} of {formatInr(b.limit)} · {daysLeft} days left
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Home, before Swiggy is connected: connect demo data in one tap. */
export function ConnectSwiggyTile() {
  const t = useTheme();
  const { connect } = useSwiggyConnection();
  return (
    <Tile onPress={() => connect.mutate()} label="Connect Swiggy">
      <Caption>FOOD & GROCERIES</Caption>
      <Text variant="bodyStrong">Connect Swiggy</Text>
      <Text variant="small" tone="muted">
        See food and Instamart spend, fees and late-night orders here.
      </Text>
      <View style={{ flex: 1 }} />
      <Text variant="caption" tone={connect.error ? "danger" : "link"} style={{ marginTop: t.spacing[1] }}>
        {connect.isPending ? "Connecting…" : connect.error ? connect.error.message : "Connect (demo data) ›"}
      </Text>
    </Tile>
  );
}
