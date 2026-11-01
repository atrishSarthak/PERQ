import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { moneyApi } from "@/lib/moneyApi";
import { useTheme } from "@/theme/ThemeProvider";

// A single nudge (handoff §7.4). The id is a nudge id, or "key:<dedupeKey>"
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
        <Text tone="muted">Ember may still be catching up. Pull your inbox again in a moment.</Text>
        <Button label="Close" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Ember noticed" }} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
          <EmberAvatar size={24} />
          <Text variant="caption" tone="ember">
            EMBER NOTICED
          </Text>
        </View>
        <Text variant="heading">{nudge.title}</Text>
        <Text>{nudge.body}</Text>
      </Card>
      <Button
        label="Got it"
        onPress={async () => {
          await moneyApi.markNudge(nudge.id, "acted").catch(() => {});
          qc.invalidateQueries({ queryKey: ["nudges"] });
          router.back();
        }}
      />
      <Button
        label="Not useful"
        kind="ghost"
        onPress={async () => {
          await moneyApi.markNudge(nudge.id, "dismissed").catch(() => {});
          qc.invalidateQueries({ queryKey: ["nudges"] });
          router.back();
        }}
      />
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
              <View key={f.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
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
    </Screen>
  );
}
