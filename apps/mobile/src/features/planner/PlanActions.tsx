import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { addDays, formatDay, formatInr } from "@perq/finance-engine";
import type { PlanDetailResponse, PlanResult } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useConfirmProposal } from "@/lib/moneyQueries";
import { syncNotifications } from "@/lib/notifications";
import { usePatchPlan } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";
import { Chip } from "./PlanForm";

// Plan actions (Step 3 §8): remind, savings goal, save, bought, not buying.
// Every change is a status update the user taps; nothing happens on its own
// except the reminder, which Ember re-plans on fresh numbers when it fires.

const firstOfNextMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/** The day Ember suggests for the reminder: the best day to buy, a new month on a wait, else tomorrow. */
export function suggestedRemindDay(r: PlanResult): string {
  const rec = r.recommended;
  if (r.verdict !== "wait" && rec.purchaseDate > r.asOf) return rec.purchaseDate;
  if (r.verdict === "wait") return firstOfNextMonth(r.asOf);
  return addDays(r.asOf, 1);
}

const CLOSED: Record<string, string> = { bought: "You bought this.", dropped: "You're not buying this.", expired: "This plan expired." };

export function PlanActions({ plan }: { plan: PlanDetailResponse }) {
  const t = useTheme();
  const p = plan.plan;
  const r = p.result!;
  const patch = usePatchPlan(p.id);
  const confirmGoal = useConfirmProposal();
  const [picking, setPicking] = useState(false);
  const [goal, setGoal] = useState<"idle" | "saving" | "saved">("idle");

  // Any status change can move or drop a reminder, so the device's local fallback is resynced.
  const update = (body: Parameters<typeof patch.mutate>[0]) => patch.mutate(body, { onSuccess: () => syncNotifications().catch(() => {}) });
  const remind = (day: string) =>
    patch.mutate(
      { status: "reminder_set", remindAt: day },
      {
        onSuccess: () => {
          setPicking(false);
          syncNotifications().catch(() => {});
          Alert.alert("Reminder set", `Ember will re-check this plan with fresh numbers and remind you on ${formatDay(day)} at 9 am.`);
        },
      }
    );

  if (CLOSED[p.status]) {
    const m = plan.matchedTransaction;
    return (
      <Card>
        <Text variant="bodyStrong">{CLOSED[p.status]}</Text>
        {m ? (
          <Text variant="small" tone="muted">
            {formatInr(m.amount)} at {m.merchant ?? "the shop"} on {formatDay(m.date)}, on your {m.cardLabel}.
          </Text>
        ) : null}
        {p.status !== "bought" ? (
          <Pressable onPress={() => patch.mutate({ status: "planned" })} accessibilityRole="button" hitSlop={6}>
            <Text tone="link" variant="small">
              Reopen this plan
            </Text>
          </Pressable>
        ) : null}
      </Card>
    );
  }

  const suggested = suggestedRemindDay(r);
  const days = [...new Set([suggested, addDays(r.asOf, 1), addDays(r.asOf, 7), firstOfNextMonth(r.asOf)])].filter((d) => d > r.asOf).sort();
  const gp = r.goalProposal;

  return (
    <View style={{ gap: t.spacing[3] }}>
      {p.status === "reminder_set" && p.remindAt ? (
        <Card>
          <Text variant="bodyStrong">Reminder on {formatDay(p.remindAt)}</Text>
          <Text variant="small" tone="muted">
            Ember will re-check the plan with that day's numbers and tell you if the answer changed.
          </Text>
          <View style={{ flexDirection: "row", gap: t.spacing[4] }}>
            <Pressable onPress={() => setPicking((v) => !v)} accessibilityRole="button" hitSlop={6}>
              <Text tone="link" variant="small">
                Change the day
              </Text>
            </Pressable>
            <Pressable onPress={() => update({ status: "planned", remindAt: null })} accessibilityRole="button" hitSlop={6}>
              <Text tone="link" variant="small">
                Cancel the reminder
              </Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <View style={{ gap: t.spacing[2] }}>
          <Button label={`Remind me on ${formatDay(suggested)}`} onPress={() => remind(suggested)} loading={patch.isPending} />
          <Pressable onPress={() => setPicking((v) => !v)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: "center" }}>
            <Text tone="link" variant="small">
              Another day
            </Text>
          </Pressable>
        </View>
      )}
      {picking ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
          {days.map((d) => (
            <Chip key={d} label={d === addDays(r.asOf, 1) ? "Tomorrow" : formatDay(d)} selected={p.remindAt === d} onPress={() => remind(d)} />
          ))}
        </View>
      ) : null}

      {gp && goal !== "saved" ? (
        <Card style={{ borderColor: t.colors.ember, borderWidth: 1 }}>
          <Text variant="caption" tone="ember">
            START A SAVINGS GOAL
          </Text>
          <Text variant="bodyStrong">
            {gp.name}: {formatInr(gp.target)}
            {gp.targetDate ? ` by ${formatDay(gp.targetDate)}` : ""}
          </Text>
          <Text variant="small" tone="muted">
            {gp.monthlySaving
              ? `That's ${formatInr(gp.monthlySaving)} a month, from what you have left after your other goals.`
              : "Ember doesn't know your saving pace yet, so pick a date in Goals after you add it."}
          </Text>
          <Button
            label="Add this goal"
            kind="secondary"
            loading={goal === "saving"}
            onPress={async () => {
              setGoal("saving");
              try {
                await confirmGoal({ kind: "goal", name: gp.name, target: gp.target, date: gp.targetDate });
                setGoal("saved");
              } catch (e) {
                setGoal("idle");
                Alert.alert("Couldn't add the goal", e instanceof Error ? e.message : "Try again.");
              }
            }}
          />
        </Card>
      ) : null}
      {goal === "saved" ? (
        <Text variant="small" tone="success">
          Goal added. You'll see it under Budgets and goals.
        </Text>
      ) : null}

      <Button label="Ask Ember about this" kind="secondary" onPress={() => router.push(`/chat/${encodeURIComponent(`plan:${p.id}`)}`)} />
      <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
        {p.status === "draft" ? <Button label="Save plan" kind="secondary" onPress={() => patch.mutate({ status: "planned" })} style={{ flex: 1 }} /> : null}
        <Button label="I bought it" kind="secondary" onPress={() => update({ status: "bought" })} style={{ flex: 1 }} />
        <Button label="Not buying" kind="secondary" onPress={() => update({ status: "dropped" })} style={{ flex: 1 }} />
      </View>
      {patch.error ? (
        <Text variant="small" tone="danger">
          {patch.error.message}
        </Text>
      ) : null}
    </View>
  );
}
