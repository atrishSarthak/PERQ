import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { Amount, CategoryBars, dueLine, monthName, shortDate } from "@/features/money/components";
import { LeakageBanner } from "@/features/results/components";
import { SpendSyncPrompt } from "@/features/results/SpendSync";
import { useAuth } from "@/lib/auth";
import { useMarkPaid, useMoneyState, useNudges } from "@/lib/moneyQueries";
import { hasAskedForNotifications } from "@/lib/notifications";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// Home (handoff §10.1): left to spend, Ember noticed, upcoming dues,
// spending this month, and the Step 1 pick. Empty state before any statement.

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const t = useTheme();
  const { user } = useAuth();
  const results = useResults();
  const state = useMoneyState();
  const nudges = useNudges();
  const markPaid = useMarkPaid();

  // First visit to Home after sign-in: explain notifications before any OS prompt.
  useEffect(() => {
    hasAskedForNotifications().then((asked) => !asked && router.push("/notifications"));
  }, []);

  if (state.isLoading || results.isLoading) return <Loading />;
  if (state.error) return <ErrorState message={state.error.message} onRetry={() => state.refetch()} />;
  const s = state.data!;
  const name = user?.name ?? user?.email.split("@")[0];
  const top = results.data?.result.ranked[0];
  const hasStatements = s.cards.some((c) => c.latestStatement);
  const unread = nudges.data?.nudges.find((n) => n.status === "sent") ?? nudges.data?.nudges.find((n) => n.status === "opened");
  const unreadCount = nudges.data?.unread ?? 0;
  const dues = s.cards
    .filter((c) => c.latestStatement?.dueDate && c.latestStatement.totalDue !== null && (c.daysToDue ?? -1) >= 0)
    .sort((a, b) => (a.daysToDue ?? 99) - (b.daysToDue ?? 99));

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="title" style={{ flex: 1 }}>
          {greeting()}
          {name ? `, ${name}` : ""}
        </Text>
        <Pressable onPress={() => router.push("/inbox")} accessibilityRole="button" accessibilityLabel={`Nudge inbox, ${unreadCount} unread`} hitSlop={10}>
          <Text variant="heading">🔔{unreadCount ? <Text variant="small" tone="ember"> {unreadCount}</Text> : null}</Text>
        </Pressable>
      </View>

      {!hasStatements ? (
        <Card>
          <Text variant="heading">See your real money picture</Text>
          <Text tone="muted">Upload a credit card statement and Ember will track dues, fees, rewards and spending for you.</Text>
          <Button label="Upload your first statement" onPress={() => router.push("/upload")} />
          <Text variant="caption" tone="muted">
            We read it once and delete the file. The password is never stored on our side.
          </Text>
        </Card>
      ) : (
        <>
          <Pressable onPress={() => router.push("/budgets")} accessibilityRole="button">
            {s.month.leftToSpend !== null ? (
              <View>
                <Text variant="caption" tone="muted">
                  LEFT TO SPEND IN {monthName(s.month.key).toUpperCase()}
                </Text>
                <Text variant="display" tone={s.month.leftToSpend < 0 ? "danger" : "default"}>
                  {formatInr(s.month.leftToSpend)}
                </Text>
                <Text tone="muted" variant="small">
                  {s.month.daysLeft} days left · {formatInr(s.month.totalSpend)} spent
                </Text>
              </View>
            ) : (
              <View>
                <Text variant="caption" tone="muted">
                  SPENT IN {monthName(s.month.key).toUpperCase()}
                </Text>
                <Text variant="display">{formatInr(s.month.totalSpend)}</Text>
                <Text tone="link" variant="small">
                  Set a monthly budget ›
                </Text>
              </View>
            )}
          </Pressable>
          <Text variant="caption" tone="muted">
            Based on statements up to {shortDate(s.dataThrough)}
            {s.month.coverage === "partial" ? " · this month isn't fully covered yet" : ""}
          </Text>

          {unread ? (
            <Pressable onPress={() => router.push(`/nudge/${unread.id}`)} accessibilityRole="button" accessibilityHint="Opens a chat with Ember about this">
              <Card style={{ borderColor: t.colors.ember, borderLeftWidth: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
                  <EmberAvatar size={24} />
                  <Text variant="caption" tone="ember">
                    EMBER NOTICED
                  </Text>
                </View>
                <Text variant="bodyStrong">{unread.title}</Text>
                <Text tone="muted" variant="small">
                  {unread.body}
                </Text>
              </Card>
            </Pressable>
          ) : null}

          <Card>
            <Text variant="heading">Upcoming dues</Text>
            {dues.length ? (
              dues.map((c) => (
                <View key={c.cardAccountId} style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/account/${c.cardAccountId}`)} accessibilityRole="button">
                    <Text variant="bodyStrong">{c.label}</Text>
                    <Text variant="small" tone={c.daysToDue !== null && c.daysToDue <= 3 && !c.isPaidMarked ? "danger" : "muted"}>
                      {dueLine(c)}
                    </Text>
                  </Pressable>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Amount value={c.latestStatement!.totalDue!} href={`/account/${c.cardAccountId}`} />
                    {!c.isPaidMarked ? (
                      <Pressable onPress={() => markPaid.mutate(c.cardAccountId)} accessibilityRole="button" hitSlop={6}>
                        <Text tone="link" variant="small">
                          Mark as paid
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text tone="muted">No bills due right now.</Text>
            )}
          </Card>

          <Card>
            <Text variant="heading">Spending this month</Text>
            <CategoryBars spend={s.month.spendByCategory} limits={s.month.budget?.categoryLimits} />
          </Card>

          <Button label="Upload a statement" kind="secondary" onPress={() => router.push("/upload")} />
        </>
      )}

      <SpendSyncPrompt />
      {results.data ? <LeakageBanner leakage={results.data.result.leakage} /> : null}
      {top ? (
        <Pressable onPress={() => router.push("/cards")} accessibilityRole="button" accessibilityHint="Opens your ranked cards">
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
              <EmberAvatar size={24} />
              <Text variant="caption" tone="ember">
                EMBER'S PICK FOR YOU
              </Text>
            </View>
            <Text variant="heading">{top.name}</Text>
            <Text variant="display" tone="ember">
              {formatInr(top.ongoingValue)}
              <Text tone="muted"> / yr</Text>
            </Text>
            <Text tone="muted" variant="small">
              {top.reason}
            </Text>
            <Text tone="link" variant="bodyStrong">
              See all your cards ›
            </Text>
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}
