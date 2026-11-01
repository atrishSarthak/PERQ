import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr } from "@perq/finance-engine";
import { TXN_CATEGORIES, type TxnCategory } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { categoryLabel, shortDate } from "@/features/money/components";
import { moneyApi } from "@/lib/moneyApi";
import { useInvalidateMoney } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";

// Budgets & goals (handoff §10.7). Category limits prefill from average
// monthly spend on statements; Ember can also propose one in chat.

const BUDGETABLE = TXN_CATEGORIES.filter((c) => !["transfers", "fees_interest", "emi", "cash"].includes(c));
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const roundUp = (n: number) => Math.ceil(n / 500) * 500;

export default function BudgetsAndGoals() {
  const t = useTheme();
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney();
  const budget = useQuery({ queryKey: ["budget"], queryFn: moneyApi.budget });
  const goals = useQuery({ queryKey: ["goals"], queryFn: moneyApi.goals });
  const [total, setTotal] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState({ name: "", target: "", date: "" });
  const [addTo, setAddTo] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = budget.data;
    if (!d || Object.keys(limits).length) return;
    if (d.budget) {
      setTotal(d.budget.totalLimit ? String(d.budget.totalLimit) : "");
      setLimits(Object.fromEntries(Object.entries(d.budget.categoryLimits).map(([k, v]) => [k, String(v)])));
    } else if (d.suggested) {
      setLimits(Object.fromEntries(Object.entries(d.suggested.perMonth).filter(([k]) => BUDGETABLE.includes(k as TxnCategory)).map(([k, v]) => [k, String(roundUp(v))])));
    }
  }, [budget.data, limits]);

  if (budget.isLoading || goals.isLoading) return <Loading />;
  if (budget.error) return <ErrorState message={budget.error.message} onRetry={() => budget.refetch()} />;
  const d = budget.data!;
  const refresh = async () => {
    await invalidate();
    await qc.invalidateQueries({ queryKey: ["budget"] });
    await qc.invalidateQueries({ queryKey: ["goals"] });
  };

  return (
    <Screen edges={["bottom"]}>
      <Card>
        <Text variant="heading">Monthly budget</Text>
        <Text variant="small" tone="muted">
          {d.budget ? "Your budget. Change any number and save." : d.suggested ? `Prefilled from your average over ${d.suggested.statementCount} statement${d.suggested.statementCount === 1 ? "" : "s"}, rounded up.` : "Set limits for the categories you care about."}
        </Text>
        <TextField label="Total for the month (₹, optional)" value={total} onChangeText={setTotal} keyboardType="number-pad" />
        {BUDGETABLE.map((c) => {
          const spent = d.spendByCategory[c] ?? 0;
          if (limits[c] === undefined && !spent) return null;
          return (
            <View key={c} style={{ gap: 4 }}>
              <TextField label={`${categoryLabel(c)} (₹)`} value={limits[c] ?? ""} onChangeText={(v) => setLimits((l) => ({ ...l, [c]: v }))} keyboardType="number-pad" />
              <Text variant="caption" tone="muted">
                {formatInr(spent)} spent this month
              </Text>
            </View>
          );
        })}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
          {BUDGETABLE.filter((c) => limits[c] === undefined && !(d.spendByCategory[c] ?? 0)).map((c) => (
            <Pressable key={c} onPress={() => setLimits((l) => ({ ...l, [c]: "" }))} accessibilityRole="button">
              <Text tone="link" variant="small">
                + {categoryLabel(c)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button
          label="Save budget"
          loading={saving}
          onPress={async () => {
            setSaving(true);
            const categoryLimits = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, digits(v)]).filter(([, v]) => (v as number) > 0));
            await moneyApi.saveBudget({ month: null, totalLimit: digits(total) || null, categoryLimits: categoryLimits as never });
            await refresh();
            setSaving(false);
          }}
        />
      </Card>

      <Card>
        <Text variant="heading">Goals</Text>
        {(goals.data?.goals ?? []).filter((g) => g.status !== "archived").map((g) => (
          <View key={g.id} style={{ gap: t.spacing[2], paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyStrong">{g.name}</Text>
              <Text variant="small">
                {formatInr(g.savedAmount)} / {formatInr(g.targetAmount)}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surface2 }}>
              <View style={{ width: `${g.pctDone}%`, height: 8, borderRadius: 4, backgroundColor: g.behindBy > 0 ? t.colors.warning : t.colors.success }} />
            </View>
            <Text variant="caption" tone="muted">
              {g.targetDate ? `By ${shortDate(g.targetDate)}` : "No date"}
              {g.monthlyNeeded ? ` · ${formatInr(g.monthlyNeeded)} a month gets you there` : ""}
              {g.behindBy > 0 ? ` · ${formatInr(g.behindBy)} behind plan` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: t.spacing[2], alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <TextField label="Add savings (₹)" value={addTo[g.id] ?? ""} onChangeText={(v) => setAddTo((a) => ({ ...a, [g.id]: v }))} keyboardType="number-pad" />
              </View>
              <Button
                label="Add"
                kind="secondary"
                disabled={!digits(addTo[g.id] ?? "")}
                onPress={async () => {
                  await moneyApi.patchGoal(g.id, { savedAmount: g.savedAmount + digits(addTo[g.id] ?? "") });
                  setAddTo((a) => ({ ...a, [g.id]: "" }));
                  await refresh();
                }}
              />
            </View>
          </View>
        ))}
        <Text variant="bodyStrong">New goal</Text>
        <TextField label="Name" value={goal.name} onChangeText={(v) => setGoal((g) => ({ ...g, name: v }))} placeholder="Goa trip" />
        <TextField label="Target (₹)" value={goal.target} onChangeText={(v) => setGoal((g) => ({ ...g, target: v }))} keyboardType="number-pad" />
        <TextField label="By (YYYY-MM-DD, optional)" value={goal.date} onChangeText={(v) => setGoal((g) => ({ ...g, date: v }))} placeholder="2027-05-12" />
        <Button
          label="Add goal"
          kind="secondary"
          disabled={!goal.name.trim() || !digits(goal.target)}
          onPress={async () => {
            await moneyApi.createGoal({ name: goal.name.trim(), targetAmount: digits(goal.target), targetDate: /^\d{4}-\d{2}-\d{2}$/.test(goal.date) ? goal.date : null });
            setGoal({ name: "", target: "", date: "" });
            await refresh();
          }}
        />
        <Text variant="caption" tone="muted">
          Or ask Ember to suggest a budget or goal. Nothing is saved until you confirm.
        </Text>
      </Card>
    </Screen>
  );
}
