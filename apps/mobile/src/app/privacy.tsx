import { Alert, Switch, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth";
import { moneyApi } from "@/lib/moneyApi";
import { useInvalidateMoney } from "@/lib/moneyQueries";
import { declineNotifications, enableNotifications } from "@/lib/notifications";
import { forgetAllPasswords } from "@/lib/statementPasswords";
import { useTheme } from "@/theme/ThemeProvider";

// Privacy & data (handoff §10.9, §12). Deletion is immediate and cascades.
export default function Privacy() {
  const t = useTheme();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const invalidate = useInvalidateMoney();
  const consents = useQuery({ queryKey: ["consents"], queryFn: moneyApi.consents });
  if (consents.isLoading) return <Loading />;
  if (consents.error) return <ErrorState message={consents.error.message} onRetry={() => consents.refetch()} />;
  const c = consents.data!;

  const confirmDelete = (title: string, body: string, run: () => Promise<void>) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => run().catch((e) => Alert.alert("Couldn't delete", (e as Error).message)) },
    ]);

  return (
    <Screen edges={["bottom"]}>
      <Card>
        <Text variant="heading">What PERQ keeps</Text>
        <Text variant="small" tone="muted">
          From each statement: the summary figures and transaction lines (card numbers removed, last 4 digits only). The PDF and its password are read once in memory and never stored. A password you choose to remember stays in this phone's keychain.
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Consents</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text>Notifications from Ember</Text>
          <Switch
            value={c.current.notifications}
            onValueChange={async (on) => {
              if (on) await enableNotifications().catch(() => false);
              else {
                await declineNotifications();
                await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
              }
              qc.invalidateQueries({ queryKey: ["consents"] });
            }}
            accessibilityLabel="Notifications from Ember"
          />
        </View>
        {c.consents.map((x, i) => (
          <Text key={i} variant="caption" tone="muted">
            {new Date(x.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}: {x.granted ? "allowed" : "turned off"}{" "}
            {x.source === "statements" ? "statement reading" : "notifications"} (notice {x.noticeVersion})
          </Text>
        ))}
      </Card>

      <Card>
        <Text variant="heading">Delete data</Text>
        <Text variant="small" tone="muted">
          To delete one statement, open the card in Cards → My cards.
        </Text>
        <Button
          label="Delete all financial data"
          kind="secondary"
          onPress={() =>
            confirmDelete(
              "Delete all financial data?",
              "Every statement, transaction, card, budget, goal, nudge and nudge chat is deleted now. Your account and quiz answers stay.",
              async () => {
                await moneyApi.deleteFinancialData();
                await forgetAllPasswords();
                await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
                await invalidate();
                router.back();
              }
            )
          }
        />
        <Button
          label="Delete my account"
          kind="ghost"
          onPress={() =>
            confirmDelete("Delete your PERQ account?", "Everything is deleted now, including your quiz answers and chats. This can't be undone.", async () => {
              await moneyApi.deleteAccount();
              await forgetAllPasswords();
              await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
              await signOut();
            })
          }
        />
        <Text variant="caption" tone="danger" style={{ marginTop: t.spacing[1] }}>
          Deletion is immediate.
        </Text>
      </Card>
    </Screen>
  );
}
