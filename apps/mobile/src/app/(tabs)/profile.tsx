import { Pressable, Switch, View } from "react-native";
import { router } from "expo-router";
import { QUIZ_QUESTIONS, type QuizKey } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { Text } from "@/components/Text";
import { answerSummary } from "@/features/quiz/answerLabels";
import { useAuth } from "@/lib/auth";
import { useCatalogue, useResults, useSetHeld, useSyncSpend } from "@/lib/queries";
import { useSwiggyConnection, useSwiggyStatus } from "@/lib/swiggyApi";
import { useThemeContext, type ThemePreference } from "@/theme/ThemeProvider";

const SHORT_TITLES: Record<QuizKey, string> = {
  cardsHeld: "Cards you have",
  occupation: "What you do",
  monthlyIncome: "Monthly income",
  monthlySpend: "Monthly spending",
  travelPerYear: "Trips a year",
  feeTolerance: "Fee you're OK with",
  priorities: "What matters most",
  openToSecured: "Open to an FD-backed card",
};

export default function Profile() {
  const { user, signOut } = useAuth();
  const { theme: t, preference, setPreference } = useThemeContext();
  const results = useResults();
  const catalogue = useCatalogue();
  const setHeld = useSetHeld();
  const syncSpend = useSyncSpend();
  const swiggy = useSwiggyStatus();
  const swiggyConn = useSwiggyConnection();
  const spendSync = results.data?.spendSync;
  const answers = results.data?.answers;
  const name = (id: string) => catalogue.data?.cards.find((c) => c.id === id)?.name ?? id;
  const confirm = new Set(results.data?.needsConfirmation ?? []);

  return (
    <Screen>
      {/* Hidden Diagnostics: long-press the title (handoff §0.7). */}
      <Pressable onLongPress={() => router.push("/diagnostics")} delayLongPress={600}>
        <Text variant="title" accessibilityRole="header">
          Profile
        </Text>
      </Pressable>
      <Text tone="muted">{user?.email}</Text>

      {spendSync?.available ? (
        <Card>
          <Text variant="heading">Card ranking uses</Text>
          <Text variant="small" tone="muted">
            {spendSync.source === "statements"
              ? `Your real spending from ${spendSync.statementCount} statement${spendSync.statementCount === 1 ? "" : "s"}.`
              : "Your quiz estimates."}
          </Text>
          <Button
            label={spendSync.source === "statements" ? "Switch back to quiz answers" : "Use my real spending"}
            kind="secondary"
            loading={syncSpend.isPending}
            onPress={() => syncSpend.mutate(spendSync.source === "statements" ? "quiz" : "statements")}
          />
        </Card>
      ) : null}

      {/* Step 4: Swiggy (demo data unless SWIGGY_MODE=live on the server). */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="heading">Swiggy</Text>
          {swiggy.data?.connected ? (
            <Text variant="caption" tone="success">
              ● Connected{swiggy.data.mode === "mock" ? " · demo data" : ""}
            </Text>
          ) : null}
        </View>
        <Text variant="small" tone="muted">
          {swiggy.data?.connected
            ? "Ember tracks your food and Instamart spending and fees, and can build a grocery cart within a budget. Nothing is ordered without your tap."
            : "Connect Swiggy so Ember can track food and grocery spending and fees, and plan grocery carts within your budget."}
        </Text>
        {swiggy.data?.connected ? (
          <Button kind="ghost" label="Disconnect Swiggy" loading={swiggyConn.disconnect.isPending} onPress={() => swiggyConn.disconnect.mutate()} />
        ) : (
          <Button label="Connect Swiggy" loading={swiggyConn.connect.isPending || swiggy.isLoading} onPress={() => swiggyConn.connect.mutate()} />
        )}
        {swiggyConn.connect.error ? (
          <Text variant="small" tone="danger">
            {swiggyConn.connect.error.message}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">Money</Text>
        {[
          { label: "Budgets & goals", href: "/budgets" as const },
          { label: "Your plans", href: "/plans" as const },
          { label: "What Ember did", href: "/activity" as const },
          { label: "Privacy & data", href: "/privacy" as const },
        ].map((l) => (
          <Pressable
            key={l.href}
            accessibilityRole="button"
            onPress={() => router.push(l.href)}
            style={{ paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}
          >
            <Text tone="link" variant="bodyStrong">
              {l.label} ›
            </Text>
          </Pressable>
        ))}
      </Card>

      {answers ? (
        <Card>
          <Text variant="heading">Your answers</Text>
          <Text variant="small" tone="muted">
            Tap any answer to change it. Your cards re-rank straight away.
          </Text>
          {QUIZ_QUESTIONS.filter((q) => q.key !== "openToSecured" || answers.openToSecured !== null || confirm.has("openToSecured")).map((q) => (
            <Pressable
              key={q.key}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/edit/[key]", params: { key: q.key } })}
              style={{ paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border, gap: 2 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="small" tone="muted">
                  {SHORT_TITLES[q.key]}
                </Text>
                {confirm.has(q.key) ? (
                  <Text variant="caption" tone="danger">
                    Please confirm
                  </Text>
                ) : null}
              </View>
              <Text>{answerSummary(q.key, answers, name)}</Text>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Button label="Take the card quiz" onPress={() => router.push("/quiz")} />
      )}

      {answers && answers.cardsHeld.length ? (
        <Card>
          <Text variant="heading">Your cards</Text>
          {answers.cardsHeld.map((id) => (
            <View key={id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: t.spacing[3] }}>
              <Text style={{ flex: 1 }}>{name(id)}</Text>
              <Switch
                accessibilityLabel={`I have the ${name(id)}`}
                value
                onValueChange={(held) => setHeld.mutate({ cardId: id, held })}
                trackColor={{ true: t.colors.primary, false: t.colors.surface2 }}
              />
            </View>
          ))}
          <Text variant="small" tone="muted">
            Add a card from its row on the Cards tab, or edit "Cards you have" above.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Theme</Text>
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </Card>

      {answers ? <Button kind="secondary" label="Retake the quiz" onPress={() => router.push({ pathname: "/quiz", params: { retake: "1" } })} /> : null}
      <Button kind="ghost" label="Sign out" onPress={signOut} />
    </Screen>
  );
}
