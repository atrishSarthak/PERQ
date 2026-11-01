import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import type { PartialPlanInput, PlanInput } from "@perq/shared";
import { Button } from "@/components/Button";
import { SurfaceFill } from "@/components/Card";
import { Text } from "@/components/Text";
import { setDraftToConfirm, usePlan } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";
import { cap, draftToInput } from "./chatMessage";
import { optionWhen, VerdictChip } from "./components";

// The planner inside an Ember thread (Step 3 §6.4, §10.7): the "Right?" card
// for details read from a message, and the result card for a finished plan.

export function PlanConfirmCard({
  draft,
  missing,
  used,
  onPlan,
}: {
  draft: PartialPlanInput;
  missing: ("price" | "item")[];
  used: boolean;
  onPlan: (input: PlanInput) => void;
}) {
  const t = useTheme();
  const input = missing.length ? null : draftToInput(draft);
  const edit = () => {
    setDraftToConfirm({ draft, source: "chat", notes: [] });
    router.push("/plan/new");
  };
  return (
    <View style={{ padding: t.spacing[3], borderRadius: t.radii.md, borderWidth: 1, borderColor: t.colors.ember, gap: t.spacing[2] }}>
      <Text variant="caption" tone="ember">
        CHECK THESE BEFORE EMBER PLANS
      </Text>
      <Text variant="bodyStrong">
        {draft.item?.name ? cap(draft.item.name) : "Which item?"}, {draft.price ? formatInr(draft.price) : "price?"}
        {draft.merchant ? ` at ${draft.merchant}` : ""}. Right?
      </Text>
      {(draft.offers ?? []).map((o) => (
        <Text key={o.rawText} variant="small" tone="muted">
          Offer: {o.rawText}
        </Text>
      ))}
      {(draft.emiOptions ?? []).map((e, i) => (
        <Text key={i} variant="small" tone="muted">
          EMI: {e.tenureMonths} months{e.noCost ? ", no-cost" : e.interestRatePa ? `, ${e.interestRatePa}% a year` : ""}
          {e.processingFee ? `, ${formatInr(e.processingFee)} fee` : ""}
        </Text>
      ))}
      {missing.includes("price") ? (
        <Text variant="small" tone="muted">
          Tell Ember the price, or add it in the details.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
        {input ? <Button label={used ? "Planned" : "Plan it"} disabled={used} onPress={() => onPlan(input)} style={{ flex: 1 }} /> : null}
        <Button label={input ? "Edit" : "Add the details"} kind="secondary" disabled={used} onPress={edit} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function PlanResultCard({ planId, onReady }: { planId: string; onReady?: () => void }) {
  const t = useTheme();
  const plan = usePlan(planId);
  const r = plan.data?.plan.result;
  // The card arrives after its message: let the thread scroll to it.
  useEffect(() => {
    if (r) onReady?.();
  }, [r, onReady]);
  if (!r) return null;
  return (
    <Pressable onPress={() => router.push(`/plan/${planId}`)} accessibilityRole="button" accessibilityHint="Opens the full plan">
      <View style={{ padding: t.spacing[3], borderRadius: t.radii.md, borderWidth: 1, borderColor: t.colors.border, overflow: "hidden", gap: t.spacing[2] }}>
        <SurfaceFill />
        <Text variant="caption" tone="muted">
          {plan.data!.plan.itemName.toUpperCase()}
        </Text>
        <VerdictChip result={r} />
        <Text variant="bodyStrong">{r.recommended.label}</Text>
        <Text variant="small" tone="muted">
          {optionWhen(r.recommended, r.asOf)} · {formatInr(r.recommended.netCost)}
          {r.recommended.savingVsUpi > 0 ? ` · ${formatInr(r.recommended.savingVsUpi)} less than UPI` : ""}
        </Text>
        <Text tone="link" variant="small">
          See the full plan ›
        </Text>
      </View>
    </Pressable>
  );
}
