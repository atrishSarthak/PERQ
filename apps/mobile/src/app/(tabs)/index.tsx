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
import { CanIBuyTile, Caption, Meter, NudgeStrip, Row, Tile } from "@/features/home/Bento";
import { SpendOverview } from "@/features/home/SpendOverview";
import { monthName, shortDate } from "@/features/money/components";
import { SpendSyncPrompt } from "@/features/results/SpendSync";
import { ConnectSwiggyTile, useSwiggySyncOnFocus } from "@/features/swiggy/HomeCard";
import { useAuth } from "@/lib/auth";
import { useMarkPaid, useMoneyState, useNudges } from "@/lib/moneyQueries";
import { hasAskedForNotifications } from "@/lib/notifications";
import { usePlans } from "@/lib/plannerApi";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// Home (handoff §10.1) as a bento grid: left to spend, the month's spend by
// category, Ember noticed, then one tile per feature with its headline number.
// Empty state before any statement.

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
  const plans = usePlans();
  useSwiggySyncOnFocus(!!state.data?.swiggy);

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
  const openPlans = (plans.data?.plans ?? []).filter((p) => p.status === "planned" || p.status === "reminder_set");
  const dues = s.cards
    .filter((c) => c.latestStatement?.dueDate && c.latestStatement.totalDue !== null && (c.daysToDue ?? -1) >= 0)
    .sort((a, b) => (a.daysToDue ?? 99) - (b.daysToDue ?? 99));

  const utilPct = s.totals.utilisationOverallPct;
  const goal = s.goals[0];
  const due = dues[0];
  const pickTile = top ? (
    <Tile href="/cards" label={`Ember's pick: ${top.name}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
        <EmberAvatar size={40} />
        <View style={{ flex: 1 }}>
          <Caption tone="ember">EMBER'S PICK FOR YOU</Caption>
          <Text variant="bodyStrong" numberOfLines={1}>
            {top.name}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="heading" tone="ember">
            {formatInr(top.ongoingValue)}
          </Text>
          <Text variant="caption" tone="muted">
            a year
          </Text>
        </View>
      </View>
    </Tile>
  ) : null;

  return (
    <Screen contentStyle={{ gap: t.spacing[3] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {greeting()}
          {name ? `, ${name}` : ""}
        </Text>
        <Pressable onPress={() => router.push("/inbox")} accessibilityRole="button" accessibilityLabel={`Nudge inbox, ${unreadCount} unread`} hitSlop={10}>
          <Text variant="heading">🔔{unreadCount ? <Text variant="small" tone="ember"> {unreadCount}</Text> : null}</Text>
        </Pressable>
      </View>

      {!hasStatements ? (
        <>
          <Card style={{ borderRadius: 26 }}>
            <Text variant="heading">See your real money picture</Text>
            <Text tone="muted">Upload a credit card statement and Ember will track dues, fees, rewards and spending for you.</Text>
            <Button label="Upload your first statement" onPress={() => router.push("/upload")} />
            <Text variant="caption" tone="muted">
              We read it once and delete the file. The password is never stored on our side.
            </Text>
          </Card>
          <SpendOverview state={s} />
          <Row>
            <CanIBuyTile openPlans={openPlans.length} />
            {s.swiggy ? null : <ConnectSwiggyTile />}
          </Row>
        </>
      ) : (
        <>
          <Pressable onPress={() => router.push("/budgets")} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: t.spacing[4], gap: 4 }}>
            <Caption>{s.month.leftToSpend !== null ? `LEFT TO SPEND IN ${monthName(s.month.key).toUpperCase()}` : `SPENT IN ${monthName(s.month.key).toUpperCase()}`}</Caption>
            <Text variant="display" tone={s.month.leftToSpend !== null && s.month.leftToSpend < 0 ? "danger" : "default"} style={{ fontSize: 46, lineHeight: 52 }}>
              {formatInr(s.month.leftToSpend ?? s.month.totalSpend)}
            </Text>
            {s.month.leftToSpend !== null ? (
              <Text variant="small" tone="muted">
                {s.month.daysLeft} days left
                {s.month.coverage === "partial" ? " · month not fully covered yet" : ""}
              </Text>
            ) : (
              <Text variant="small" tone="link">
                Set a monthly budget ›
              </Text>
            )}
          </Pressable>

          <SpendOverview state={s} />

          {unread ? <NudgeStrip id={unread.id} title={unread.title} body={unread.body} /> : null}

          <Row>
            <CanIBuyTile openPlans={openPlans.length} tall />
            <View style={{ flex: 1, gap: t.spacing[3] }}>
              <Tile>
                {due ? (
                  <>
                    <Pressable onPress={() => router.push(`/account/${due.cardAccountId}`)} accessibilityRole="button" style={{ gap: t.spacing[2] }}>
                      <Caption>NEXT DUE</Caption>
                      <Text variant="heading">{formatInr(due.latestStatement!.totalDue!)}</Text>
                      <Text variant="caption" tone={due.daysToDue !== null && due.daysToDue <= 3 && !due.isPaidMarked ? "danger" : "muted"} numberOfLines={1}>
                        {due.isPaidMarked ? "Marked paid" : due.daysToDue === 0 ? "Today" : `In ${due.daysToDue} day${due.daysToDue === 1 ? "" : "s"}`} · {due.label}
                      </Text>
                    </Pressable>
                    {!due.isPaidMarked ? (
                      <Pressable onPress={() => markPaid.mutate(due.cardAccountId)} accessibilityRole="button" hitSlop={6}>
                        <Text variant="caption" tone="link">
                          Mark as paid
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Caption>NEXT DUE</Caption>
                    <Text variant="small" tone="muted">
                      No bills due
                    </Text>
                  </>
                )}
              </Tile>
              <Tile href="/cards" label="Credit used">
                <Caption>CREDIT USED</Caption>
                <Text variant="heading" tone={utilPct !== null && utilPct > 70 ? "danger" : "default"}>
                  {utilPct !== null ? `${Math.round(utilPct)}%` : "—"}
                </Text>
                {utilPct !== null ? <Meter pct={utilPct} color={utilPct > 70 ? t.colors.danger : utilPct > 30 ? t.colors.ember : t.colors.success} /> : null}
                <Text variant="caption" tone="muted">
                  {formatInr(s.totals.totalDueAll)} due in all
                </Text>
              </Tile>
            </View>
          </Row>

          <Row>
            {s.swiggy ? null : <ConnectSwiggyTile />}
            {goal ? (
              <Tile href="/budgets" label={`Goal ${goal.name}`}>
                <Caption>GOAL · {goal.name.toUpperCase()}</Caption>
                <Text variant="heading">{Math.round(goal.pctDone)}%</Text>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {formatInr(goal.saved)} of {formatInr(goal.target)}
                </Text>
                <View style={{ flex: 1 }} />
                <Meter pct={goal.pctDone} color={goal.behindBy > 0 ? t.colors.ember : t.colors.success} />
              </Tile>
            ) : (
              <Tile href="/cards" label="Missed rewards">
                <Caption>MISSED REWARDS</Caption>
                <Text variant="heading" tone={s.missedRewardsLastCycle.total ? "ember" : "default"}>
                  {formatInr(s.missedRewardsLastCycle.total)}
                </Text>
                <Text variant="small" tone="muted">
                  last cycle, from paying with the wrong card
                </Text>
              </Tile>
            )}
          </Row>
        </>
      )}

      {pickTile}
      <SpendSyncPrompt />
      {hasStatements ? (
        <Pressable onPress={() => router.push("/upload")} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: t.spacing[2] }}>
          <Text variant="caption" tone="muted">
            Based on statements up to {shortDate(s.dataThrough)} · <Text variant="caption" tone="link">Upload a statement</Text>
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
