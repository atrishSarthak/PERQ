import { useState } from "react";
import { Alert, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { ApiError } from "@/lib/api";
import { moneyApi } from "@/lib/moneyApi";
import { syncNotifications } from "@/lib/notifications";
import { useTheme } from "@/theme/ThemeProvider";

// Demo mode (handoff §13.3, §13.4), in Diagnostics. The server only allows
// it when DEMO_ENABLED=true, and time travel only for a demo account.
export function DemoControls() {
  const t = useTheme();
  const qc = useQueryClient();
  const clock = useQuery({ queryKey: ["demo-clock"], queryFn: moneyApi.demoClock, retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  if (clock.error instanceof ApiError && clock.error.status === 404) return null; // demo disabled on this server

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const msg = await fn();
      await qc.invalidateQueries();
      await syncNotifications().catch(() => {});
      if (msg) Alert.alert(msg);
    } catch (e) {
      Alert.alert("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const now = clock.data ? new Date(clock.data.now) : null;
  const ist = now?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const travel = (days: number) =>
    run(`${days}`, async () => {
      const r = await moneyApi.demoTravel({ days });
      return r.nudgesSent ? `Ember sent ${r.nudgesSent} nudge${r.nudgesSent === 1 ? "" : "s"}.` : r.quietHours ? "It's quiet hours there, so nudges wait until 9 am." : undefined;
    });

  return (
    <Card>
      <Text variant="heading">Demo mode</Text>
      <Text variant="small" tone="muted">
        Synthetic data only. Loading replaces this account's cards, statements, budget and goals.
      </Text>
      {clock.data?.isDemo ? (
        <Text variant="bodyStrong" tone="ember">
          Demo clock: {ist} IST
        </Text>
      ) : null}
      <Button
        label="Load demo data"
        loading={busy === "load"}
        onPress={() =>
          Alert.alert("Load demo data?", "This replaces this account's financial data with the demo set.", [
            { text: "Cancel", style: "cancel" },
            { text: "Load", onPress: () => run("load", async () => `Loaded ${(await moneyApi.demoLoad()).transactions} demo transactions. Clock set to 22 Nov, 9 am.`) },
          ])
        }
      />
      {clock.data?.isDemo ? (
        <>
          <Text variant="caption" tone="muted">
            TIME TRAVEL
          </Text>
          <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
            <Button label="−1 day" kind="secondary" style={{ flex: 1 }} loading={busy === "-1"} onPress={() => travel(-1)} />
            <Button label="+1 day" kind="secondary" style={{ flex: 1 }} loading={busy === "1"} onPress={() => travel(1)} />
            <Button label="+1 week" kind="secondary" style={{ flex: 1 }} loading={busy === "7"} onPress={() => travel(7)} />
          </View>
          <Button label="Back to 22 Nov, 9 am" kind="ghost" onPress={() => run("date", async () => void (await moneyApi.demoTravel({ date: "2026-11-22" })))} />
          <Button
            label="Reset demo"
            kind="ghost"
            loading={busy === "reset"}
            onPress={() => run("reset", async () => void (await moneyApi.demoReset()))}
          />
        </>
      ) : null}
    </Card>
  );
}
