import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import type { ResultsResponse } from "@perq/shared";
import { Button } from "@/components/Button";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Text } from "@/components/Text";
import { streamEmber } from "@/lib/api";
import { RESULTS_KEY } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// "Ember is working" (handoff §1.6 screen 3): narration steps tick in one by
// one as the server streams them, then we land on the results.
export default function Working() {
  const t = useTheme();
  const qc = useQueryClient();
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();
    streamEmber(
      "/api/recommender/explain",
      {},
      (e) => {
        if (e.type === "step") setSteps((s) => (s.includes(e.label) ? s : [...s, e.label]));
        if (e.type === "explanation") {
          qc.setQueryData<ResultsResponse | null>(RESULTS_KEY, (prev) =>
            prev ? { ...prev, explanation: { text: e.text, source: e.source === "gemini" ? "gemini" : e.source === "cached" ? "cached" : "fallback_template", topCardId: e.topCardId } } : prev
          );
        }
        if (e.type === "error") setError(e.message);
        if (e.type === "done") setTimeout(() => router.replace("/cards"), 700);
      },
      controller.signal
    ).catch((err: Error) => setError(err.message));
    return () => controller.abort();
  }, [qc]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flex: 1, padding: t.spacing[6], justifyContent: "center", gap: t.spacing[6] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
          <EmberAvatar size={52} />
          <Text variant="title">
            <Text variant="title" tone="ember">
              Ember
            </Text>{" "}
            is on it
          </Text>
        </View>
        <View style={{ gap: t.spacing[4] }} accessibilityLiveRegion="polite">
          {steps.map((label, i) => {
            const active = i === steps.length - 1 && !error;
            return (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? "transparent" : t.colors.ember,
                    borderWidth: active ? 2 : 0,
                    borderColor: t.colors.ember,
                  }}
                >
                  {active ? null : <Text style={{ color: t.colors.onEmber, fontSize: 14, lineHeight: 16 }}>✓</Text>}
                </View>
                <Text tone={active ? "default" : "muted"}>{label}</Text>
              </View>
            );
          })}
          {steps.length === 0 && !error ? <Text tone="muted">Starting…</Text> : null}
        </View>
        {error ? (
          <View style={{ gap: t.spacing[3] }}>
            <Text tone="danger">{error}</Text>
            <Button label="See my cards anyway" onPress={() => router.replace("/cards")} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
