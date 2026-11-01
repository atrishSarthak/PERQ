import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { LeakageBanner } from "@/features/results/components";
import { useAuth } from "@/lib/auth";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const t = useTheme();
  const { user } = useAuth();
  const results = useResults();
  if (results.isLoading) return <Loading />;
  if (results.error) return <ErrorState message={results.error.message} onRetry={() => results.refetch()} />;
  const data = results.data;
  const top = data?.result.ranked[0];
  const name = user?.name ?? user?.email.split("@")[0];

  return (
    <Screen>
      <Text variant="title">
        {greeting()}
        {name ? `, ${name}` : ""}
      </Text>
      {data ? <LeakageBanner leakage={data.result.leakage} /> : null}
      {top ? (
        <Pressable onPress={() => router.push("/cards")} accessibilityRole="button" accessibilityHint="Opens your ranked cards">
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
              <EmberAvatar size={24} />
              <Text variant="caption" tone="ember">
                EMBER'S PICK FOR YOU
              </Text>
            </View>
            <Text variant="heading">{top.name}</Text>
            <Text variant="display" tone="ember">
              {formatInr(top.ongoingValue)}
              <Text tone="muted"> / yr</Text>
            </Text>
            <Text tone="muted" variant="small">
              {top.reason}
            </Text>
            <Text tone="link" variant="bodyStrong">
              See all your cards ›
            </Text>
          </Card>
        </Pressable>
      ) : null}
      <Card>
        <Text variant="heading">Track your real spending</Text>
        <Text tone="muted">Upload a credit card statement. Ember reads it once and deletes the file.</Text>
        <Button label="Upload a statement" onPress={() => router.push("/upload")} />
      </Card>
    </Screen>
  );
}
