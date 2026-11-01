import { useQuery } from "@tanstack/react-query";
import { formatInr } from "@perq/finance-engine";
import { View } from "react-native";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { moneyApi } from "@/lib/moneyApi";
import { useTheme } from "@/theme/ThemeProvider";

// "What Ember did" (handoff §10.8).
export default function Activity() {
  const t = useTheme();
  const q = useQuery({ queryKey: ["activity"], queryFn: moneyApi.activity });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const { events, week } = q.data!;
  return (
    <Screen edges={["bottom"]}>
      <Card>
        <Text variant="heading">This week</Text>
        {week.statementsRead ? <Text>Read {week.statementsRead} statement{week.statementsRead === 1 ? "" : "s"}</Text> : null}
        <Text>
          Sent {week.nudgesSent} nudge{week.nudgesSent === 1 ? "" : "s"}
          {week.nudgesSent ? `, you acted on ${week.nudgesActed}` : ""}
        </Text>
        {week.missedRewardsFound ? <Text>Found {formatInr(week.missedRewardsFound)} in missed rewards last cycle</Text> : null}
      </Card>
      <Card>
        <Text variant="heading">Everything Ember did</Text>
        {events.map((e) => (
          <View key={e.id} style={{ paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}>
            <Text variant="small">{e.summary}</Text>
            <Text variant="caption" tone="muted">
              {new Date(e.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </Text>
          </View>
        ))}
        {!events.length ? <Text tone="muted">Nothing yet.</Text> : null}
      </Card>
    </Screen>
  );
}
