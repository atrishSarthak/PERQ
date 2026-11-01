import { View } from "react-native";
import { formatInr } from "@perq/finance-engine";
import type { PlanDetailResponse } from "@perq/shared";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";
import { optionWhen } from "./components";

// The breakdown sections (§10.5). Checkpoint 8 makes each one expandable.
export function PlanSections({ plan }: { plan: PlanDetailResponse }) {
  const t = useTheme();
  const r = plan.plan.result!;
  return (
    <Card>
      <Text variant="heading">Best way to pay</Text>
      {r.options.map((o) => (
        <View key={o.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Text variant="small">{o.label}</Text>
            <Text variant="caption" tone="muted">
              {optionWhen(o, r.asOf)}
            </Text>
          </View>
          <Text variant="small">{formatInr(o.netCost)}</Text>
        </View>
      ))}
    </Card>
  );
}
