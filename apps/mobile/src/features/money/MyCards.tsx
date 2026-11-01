import type { ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { IssuerBadge } from "@/components/Choice";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { useMoneyState } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";
import { dueLine, shortDate, UtilisationBar } from "./components";

/** My cards (handoff §10.3): each card account with due, utilisation and points. */
export function MyCards({ header }: { header?: ReactNode }) {
  const t = useTheme();
  const state = useMoneyState();
  if (state.isLoading) return <Loading />;
  if (state.error) return <ErrorState message={state.error.message} onRetry={() => state.refetch()} />;
  const s = state.data!;

  return (
    <FlatList
      data={s.cards}
      keyExtractor={(c) => c.cardAccountId}
      onRefresh={() => state.refetch()}
      refreshing={state.isRefetching}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[12] }}
      ListHeaderComponent={
        <View style={{ gap: t.spacing[4] }}>
          {header}
          {s.dataThrough ? (
            <Text variant="small" tone="muted">
              From statements up to {shortDate(s.dataThrough)} · {formatInr(s.totals.totalDueAll)} due across cards
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Text variant="heading">No cards yet</Text>
          <Text tone="muted">Upload a statement and your card shows up here with its due date, utilisation and points.</Text>
          <Button label="Upload a statement" onPress={() => router.push("/upload")} />
        </Card>
      }
      ListFooterComponent={s.cards.length ? <Button label="Upload a statement" kind="secondary" onPress={() => router.push("/upload")} /> : undefined}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => router.push(`/account/${c.cardAccountId}`)} accessibilityRole="button" accessibilityLabel={`${c.label} ending ${c.last4}`}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
              <IssuerBadge issuer={c.issuer} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{c.label}</Text>
                <Text variant="caption" tone="muted">
                  •••• {c.last4}
                </Text>
              </View>
              {c.latestStatement?.totalDue !== null && c.latestStatement?.totalDue !== undefined ? (
                <Text variant="bodyStrong">{formatInr(c.latestStatement.totalDue)}</Text>
              ) : null}
            </View>
            <Text variant="small" tone={c.daysToDue !== null && c.daysToDue <= 3 && c.daysToDue >= 0 && !c.isPaidMarked ? "danger" : "muted"}>
              {dueLine(c)}
            </Text>
            <UtilisationBar pct={c.utilisationPct} />
            {c.points ? (
              <Text variant="small" tone="muted">
                {c.points.closing.toLocaleString("en-IN")} points{c.points.valueRupees !== null ? ` · about ${formatInr(c.points.valueRupees)}` : ""}
              </Text>
            ) : null}
          </Card>
        </Pressable>
      )}
    />
  );
}
