import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./Button";
import { Screen } from "./Screen";
import { Text } from "./Text";

export function Loading({ label = "Loading…" }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing[3], backgroundColor: t.colors.bg }}>
      <ActivityIndicator color={t.colors.link} />
      <Text tone="muted">{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen>
      <Text variant="heading">Couldn't load your cards</Text>
      <Text tone="muted">{message}</Text>
      <Button label="Try again" onPress={onRetry} />
      <Button kind="ghost" label="Open Diagnostics" onPress={() => router.push("/diagnostics")} />
    </Screen>
  );
}
