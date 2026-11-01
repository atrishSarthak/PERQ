import { useRef } from "react";
import { Animated, PanResponder, Pressable, SectionList, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { NudgeItem } from "@perq/shared";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { moneyApi } from "@/lib/moneyApi";
import { useMoneyState, useNudges } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";

// Nudge inbox (handoff §10.5): Today / Earlier, status, swipe left to dismiss.

const STATUS: Record<string, string> = { sent: "New", opened: "Seen", acted: "Done", dismissed: "Dismissed" };
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

function Row({ n, onDismiss }: { n: NudgeItem; onDismiss: () => void }) {
  const t = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 12,
      onPanResponderMove: (_e, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -100) Animated.timing(x, { toValue: -400, duration: 160, useNativeDriver: true }).start(onDismiss);
        else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;
  const unread = n.status === "sent";
  return (
    <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
      <Pressable
        onPress={() => router.push(`/nudge/${n.id}`)}
        accessibilityRole="button"
        accessibilityHint="Opens a chat with Ember. Swipe left to dismiss."
        accessibilityActions={[{ name: "dismiss", label: "Dismiss" }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "dismiss" && onDismiss()}
        style={{
          padding: t.spacing[4],
          borderRadius: t.radii.md,
          backgroundColor: t.colors.surface,
          borderWidth: 1,
          borderColor: unread ? t.colors.ember : t.colors.border,
          borderLeftWidth: unread ? 4 : 1,
          gap: 4,
          opacity: n.status === "dismissed" ? 0.6 : 1,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {n.title}
          </Text>
          <Text variant="caption" tone={unread ? "ember" : "muted"}>
            {STATUS[n.status] ?? n.status}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {n.body}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function Inbox() {
  const t = useTheme();
  const qc = useQueryClient();
  const inbox = useNudges();
  // The server's IST date, so "Today" follows a demo account's clock too.
  const asOf = useMoneyState().data?.asOf;
  if (inbox.isLoading) return <Loading />;
  if (inbox.error) return <ErrorState message={inbox.error.message} onRetry={() => inbox.refetch()} />;
  const all = inbox.data!.nudges;
  const today = asOf ?? istDay(new Date().toISOString());
  const sections = [
    { title: "Today", data: all.filter((n) => n.sentAt && istDay(n.sentAt) === today) },
    { title: "Earlier", data: all.filter((n) => !n.sentAt || istDay(n.sentAt) !== today) },
  ].filter((s) => s.data.length);

  return (
    <SectionList
      style={{ backgroundColor: t.colors.bg }}
      sections={sections}
      keyExtractor={(n) => n.id}
      onRefresh={() => inbox.refetch()}
      refreshing={inbox.isRefetching}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
      renderSectionHeader={({ section }) => (
        <Text variant="caption" tone="muted" style={{ marginTop: t.spacing[2] }}>
          {section.title.toUpperCase()}
        </Text>
      )}
      renderItem={({ item }) => (
        <Row
          n={item}
          onDismiss={async () => {
            await moneyApi.markNudge(item.id, "dismissed").catch(() => {});
            qc.invalidateQueries({ queryKey: ["nudges"] });
          }}
        />
      )}
      ListEmptyComponent={
        <Text tone="muted">Nothing yet. Ember sends at most 2 nudges a day, and never between 10 pm and 8 am.</Text>
      }
    />
  );
}
