import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { ChatThread } from "@/features/chat/ChatThread";
import { planIdFromDedupeKey } from "@perq/finance-engine";
import { moneyApi } from "@/lib/moneyApi";
import { useTheme } from "@/theme/ThemeProvider";

// Nudge → chat (handoff §7.4). The id is a nudge id, or "key:<dedupeKey>"
// when it comes from a local notification scheduled on the device.
export default function NudgeScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const ref = decodeURIComponent(raw ?? "");
  const inbox = useQuery({ queryKey: ["nudges"], queryFn: moneyApi.nudges });
  const nudge = inbox.data?.nudges.find((n) => (ref.startsWith("key:") ? n.dedupeKey === ref.slice(4) : n.id === ref));
  const [showWhy, setShowWhy] = useState(false);
  const why = useQuery({ queryKey: ["nudge-why", nudge?.id], queryFn: () => moneyApi.nudgeWhy(nudge!.id), enabled: !!nudge && showWhy });

  useEffect(() => {
    if (nudge && nudge.status === "sent") {
      moneyApi.markNudge(nudge.id, "opened").then(() => qc.invalidateQueries({ queryKey: ["nudges"] })).catch(() => {});
    }
  }, [nudge, qc]);

  if (inbox.isLoading) return <Loading />;
  if (inbox.error) return <ErrorState message={inbox.error.message} onRetry={() => inbox.refetch()} />;
  if (!nudge) {
    return (
      <Screen edges={["bottom"]}>
        <Text variant="heading">This nudge isn't here yet</Text>
        <Text tone="muted">Ember may still be catching up. Open your inbox again in a moment.</Text>
        <Button label="Close" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["nudges"] });
    qc.invalidateQueries({ queryKey: ["state"] });
    Alert.alert(msg);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: nudge.title.length > 28 ? "Ember noticed" : nudge.title }} />
      <ChatThread
        threadRef={`nudge:${nudge.id}`}
        onAction={async (action) => {
          if (action === "open_plan") {
            const planId = planIdFromDedupeKey(nudge.dedupeKey);
            await moneyApi.markNudge(nudge.id, "acted").catch(() => {});
            if (planId) router.replace(`/plan/${planId}`);
          } else if (action === "upload") {
            await moneyApi.markNudge(nudge.id, "acted").catch(() => {});
            router.replace("/upload");
          } else if (action === "remind_tomorrow") {
            await moneyApi.markNudge(nudge.id, "remind");
            done("Ember will remind you tomorrow at 9 am.");
          } else if (action === "mark_paid" && nudge.cardAccountId) {
            await moneyApi.markPaid(nudge.cardAccountId);
            await moneyApi.markNudge(nudge.id, "acted").catch(() => {});
            done("Marked as paid. Ember won't remind you about this bill again.");
          }
        }}
        footer={
          <View style={{ gap: t.spacing[2] }}>
            <Pressable onPress={() => setShowWhy((v) => !v)} accessibilityRole="button">
              <Text tone="link" variant="small">
                Why am I seeing this?
              </Text>
            </Pressable>
            {showWhy ? (
              why.data ? (
                <Card>
                  <Text variant="small">{why.data.description}</Text>
                  {why.data.figures.map((f) => (
                    <View key={f.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
                      <Text variant="small" tone="muted">
                        {f.label}
                      </Text>
                      <Text variant="small">{f.value}</Text>
                    </View>
                  ))}
                  {why.data.dataDate ? (
                    <Text variant="caption" tone="muted">
                      {why.data.dataDate}
                    </Text>
                  ) : null}
                </Card>
              ) : (
                <Text tone="muted" variant="small">
                  Loading…
                </Text>
              )
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                await moneyApi.markNudge(nudge.id, "dismissed").catch(() => {});
                qc.invalidateQueries({ queryKey: ["nudges"] });
                router.back();
              }}
            >
              <Text tone="muted" variant="small">
                Not useful? Dismiss
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
