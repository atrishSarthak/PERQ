import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { MissingData, RecommendedCard, VerdictChip } from "@/features/planner/components";
import { PlanSections } from "@/features/planner/PlanSections";
import { PlanActions } from "@/features/planner/PlanActions";
import { usePlan } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

// The plan result (Step 3 §10.5): one answer first, then every number behind it.
export default function PlanResultScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = usePlan(id);
  if (plan.isLoading) return <Loading />;
  if (plan.error || !plan.data) return <ErrorState message={plan.error?.message ?? "Plan not found"} onRetry={() => plan.refetch()} />;
  const p = plan.data.plan;
  const r = p.result;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: p.itemName }} />
      {r ? (
        <>
          <VerdictChip result={r} />
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
              <EmberAvatar size={24} />
              <Text variant="caption" tone="ember">
                EMBER
              </Text>
            </View>
            <Text>{p.explanation}</Text>
          </Card>
          <RecommendedCard result={r} />
          <PlanActions plan={plan.data} />
          <PlanSections plan={plan.data} />
          <MissingData result={r} />
        </>
      ) : (
        <Text tone="muted">This plan hasn't been worked out yet.</Text>
      )}
    </Screen>
  );
}
