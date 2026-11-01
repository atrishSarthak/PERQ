import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import type { PlanSummary } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { shortDate } from "@/features/money/components";
import { usePlans } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

// Plan history (Step 3 §10.6): open plans first, then bought, dropped and expired ones.
const STATUS_LABEL: Record<PlanSummary["status"], string> = {
  draft: "Not saved",
  planned: "Saved",
  reminder_set: "Reminder set",
  bought: "Bought",
  dropped: "Not buying",
  expired: "Expired",
};
const OPEN = new Set(["planned", "reminder_set"]);

function Row({ p }: { p: PlanSummary }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => router.push(`/plan/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.itemName}, ${formatInr(p.price)}, ${STATUS_LABEL[p.status]}`}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {p.itemName}
          </Text>
          <Text variant="bodyStrong">{formatInr(p.price)}</Text>
        </View>
        <Text variant="small" tone="muted">
          {STATUS_LABEL[p.status]}
          {p.remindAt && p.status === "reminder_set" ? ` for ${shortDate(p.remindAt)}` : ""}
          {p.recommendedLabel ? ` · ${p.recommendedLabel}` : ""}
          {` · ${shortDate(p.createdAt.slice(0, 10))}`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function Plans() {
  const plans = usePlans();
  if (plans.isLoading) return <Loading />;
  if (plans.error) return <ErrorState message={plans.error.message} onRetry={() => plans.refetch()} />;
  const list = plans.data!.plans;
  const open = list.filter((p) => OPEN.has(p.status));
  const checks = list.filter((p) => p.status === "draft");
  const done = list.filter((p) => !OPEN.has(p.status) && p.status !== "draft");
  return (
    <Screen edges={[]}>
      <Button label="Plan a new purchase" onPress={() => router.push("/plan/new")} />
      {!list.length ? <Text tone="muted">No plans yet. Ask "Should I buy this?" from Home or the Ember tab.</Text> : null}
      {open.length ? <Text variant="heading">Open</Text> : null}
      {open.map((p) => (
        <Row key={p.id} p={p} />
      ))}
      {checks.length ? <Text variant="heading">Recent checks</Text> : null}
      {checks.map((p) => (
        <Row key={p.id} p={p} />
      ))}
      {done.length ? <Text variant="heading">History</Text> : null}
      {done.map((p) => (
        <Row key={p.id} p={p} />
      ))}
    </Screen>
  );
}
