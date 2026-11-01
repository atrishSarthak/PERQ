import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { DemoControls } from "@/features/money/DemoControls";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { useTheme } from "@/theme/ThemeProvider";

// Hidden screen for "the phone can't reach the backend" (handoff §0.7).
export default function Diagnostics() {
  const t = useTheme();
  const { status, user } = useAuth();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: false, staleTime: 0 });

  const row = (label: string, value: string, tone: "default" | "success" | "danger" = "default") => (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text tone={tone} selectable>
        {value}
      </Text>
    </View>
  );

  const healthText = health.isFetching
    ? "Checking…"
    : health.data
      ? `OK · version ${health.data.version} · ${new Date(health.data.time).toLocaleTimeString()}`
      : health.error instanceof ApiError
        ? `FAILED (${health.error.kind}): ${health.error.message}`
        : "FAILED";

  return (
    <Screen edges={["bottom"]}>
      <Card>
        {row("API URL (EXPO_PUBLIC_API_URL)", API_URL || "not set")}
        {row("GET /api/health", healthText, health.data ? "success" : health.isFetching ? "default" : "danger")}
        {row("Session", status === "signedIn" ? `Signed in as ${user?.email}` : "Signed out")}
        {row("App / Expo SDK", `${Constants.expoConfig?.version ?? "?"} / ${Constants.expoConfig?.sdkVersion ?? "?"}`)}
      </Card>
      <Button label="Check again" onPress={() => health.refetch()} loading={health.isFetching} />
      {status === "signedIn" ? <DemoControls /> : null}
      <Text variant="small" tone="muted" style={{ marginTop: t.spacing[2] }}>
        If the check fails: make sure the phone and laptop share Wi-Fi, the web server runs with
        `pnpm dev:web`, and the URL above is your laptop's LAN IP. Or point EXPO_PUBLIC_API_URL at the
        Vercel deployment.
      </Text>
    </Screen>
  );
}
