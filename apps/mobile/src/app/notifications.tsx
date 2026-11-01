import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { declineNotifications, enableNotifications } from "@/lib/notifications";
import { useTheme } from "@/theme/ThemeProvider";

// Notification explainer (handoff §7.3, §12): shown once after sign-in,
// before the OS prompt. Its own consent, separate from statements.
export default function NotificationsExplainer() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
        <EmberAvatar size={40} />
        <Text variant="heading" style={{ flex: 1 }}>
          Can Ember give you a heads-up?
        </Text>
      </View>
      <Card>
        <Text variant="bodyStrong">What Ember sends</Text>
        <Text tone="muted">• A bill due in the next few days, or due today</Text>
        <Text tone="muted">• Interest or fees that showed up on a statement</Text>
        <Text tone="muted">• High card utilisation before your statement closes</Text>
        <Text tone="muted">• Rewards you could have earned, points worth using, budget and goal check-ins</Text>
      </Card>
      <Card>
        <Text variant="bodyStrong">The limits</Text>
        <Text tone="muted">At most 2 a day. Nothing between 10 pm and 8 am. Every nudge also stays in your inbox, and you can turn this off any time in Privacy.</Text>
      </Card>
      <Button
        label="Allow notifications"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await enableNotifications().catch(() => false);
          setBusy(false);
          close();
        }}
      />
      <Button
        label="Not now"
        kind="ghost"
        disabled={busy}
        onPress={async () => {
          await declineNotifications().catch(() => {});
          close();
        }}
      />
    </Screen>
  );
}
