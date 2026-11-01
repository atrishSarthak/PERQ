import { useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { PlanResult } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { MissingData, RecommendedCard, VerdictChip } from "@/features/planner/components";
import { PlanSections } from "@/features/planner/PlanSections";
import { PlanActions } from "@/features/planner/PlanActions";
import { WhatIfPanel, type WhatIfChanges } from "@/features/planner/WhatIf";
import { usePlan, useWhatIf } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

type Alt = { result: PlanResult; explanation: string; label: string; changes: WhatIfChanges };

// The plan result (Step 3 §10.5): one answer first, then every number behind
// it. A what-if replaces the view until the user keeps it or goes back.
export default function PlanResultScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = usePlan(id);
  const whatIf = useWhatIf(id);
  const [alt, setAlt] = useState<Alt | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  if (plan.isLoading) return <Loading />;
  if (plan.error || !plan.data) return <ErrorState message={plan.error?.message ?? "Plan not found"} onRetry={() => plan.refetch()} />;
  const p = plan.data.plan;
  const r = alt?.result ?? p.result;

  const run = (changes: WhatIfChanges, label: string) =>
    whatIf.mutate({ changes }, {
      onSuccess: (d) => {
        setAlt({ result: d.result, explanation: d.explanation, label, changes });
        scroll.current?.scrollTo({ y: 0, animated: true });
      },
    });
  const keep = () => alt && whatIf.mutate({ changes: alt.changes, save: true }, { onSuccess: () => setAlt(null) });
  const back = () => {
    setAlt(null);
    whatIf.reset();
  };

  return (
    <Screen edges={[]} scrollRef={scroll}>
      <Stack.Screen options={{ title: p.itemName }} />
      {r ? (
        <>
          {alt ? (
            <Card style={{ borderColor: t.colors.ember, borderWidth: 1 }}>
              <Text variant="caption" tone="ember">
                WHAT IF · NOT SAVED
              </Text>
              <Text variant="bodyStrong">{alt.label}</Text>
              <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
                <Button label="Keep this version" onPress={keep} loading={whatIf.isPending} style={{ flex: 1 }} />
                <Button label="Back to the plan" kind="secondary" onPress={back} disabled={whatIf.isPending} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : null}
          <VerdictChip result={r} />
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
              <EmberAvatar size={24} />
              <Text variant="caption" tone="ember">
                EMBER
              </Text>
            </View>
            <Text>{alt?.explanation ?? p.explanation}</Text>
          </Card>
          <RecommendedCard result={r} />
          {!alt ? <PlanActions plan={plan.data} /> : null}
          <PlanSections result={r} onPick={(c, label) => run(c, `Pay with ${label}`)} picking={whatIf.isPending} />
          <MissingData result={r} />
          <WhatIfPanel plan={plan.data} result={r} onRun={run} busy={whatIf.isPending} error={whatIf.error?.message ?? null} />
        </>
      ) : (
        <Text tone="muted">This plan hasn't been worked out yet.</Text>
      )}
    </Screen>
  );
}
