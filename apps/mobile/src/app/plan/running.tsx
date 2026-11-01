import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { plannerApi, takePendingPlan } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

// "Ember is planning" (Step 3 §10.4): narration steps from the server, then
// straight to the result.
export default function Running() {
  const t = useTheme();
  const qc = useQueryClient();
  const [pending] = useState(() => takePendingPlan());
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(pending ? null : "Nothing to plan. Go back and add the item and price.");
  const started = useRef(false);

  useEffect(() => {
    if (!pending || started.current) return;
    started.current = true;
    const ctrl = new AbortController();
    plannerApi
      .run(
        pending.input,
        pending.source,
        (e) => {
          if (e.type === "step") setSteps((s) => [...s, e.label]);
          if (e.type === "error") setError(e.message);
          if (e.type === "plan") {
            qc.invalidateQueries({ queryKey: ["plans"] });
            router.replace(`/plan/${e.planId}`);
          }
        },
        ctrl.signal
      )
      .catch((err: Error) => setError(err.message));
    return () => ctrl.abort();
  }, [pending, qc]);

  return (
    <Screen>
      <View style={{ gap: t.spacing[5], paddingTop: t.spacing[8] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
          <EmberAvatar size={44} />
          <Text variant="title">
            <Text variant="title" tone="ember">
              Ember
            </Text>{" "}
            is planning
          </Text>
        </View>
        {pending ? (
          <Text tone="muted">
            {pending.input.item.name}, {formatInr(pending.input.price)}
          </Text>
        ) : null}
        <View style={{ gap: t.spacing[3] }} accessibilityLiveRegion="polite">
          {steps.map((s, i) => (
            <View key={`${i}-${s}`} style={{ flexDirection: "row", gap: t.spacing[3], alignItems: "center" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.ember, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.colors.onEmber, fontSize: 13, lineHeight: 15 }}>✓</Text>
              </View>
              <Text tone={i === steps.length - 1 ? "default" : "muted"}>{s}</Text>
            </View>
          ))}
          {!steps.length && !error ? <Text tone="muted">Getting your cards and budget…</Text> : null}
        </View>
        {error ? (
          <>
            <Text tone="danger">{error}</Text>
            <Button label="Back" onPress={() => router.back()} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
