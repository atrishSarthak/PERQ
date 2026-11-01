import { useState } from "react";
import { router } from "expo-router";
import type { PlanInput, PlanSource } from "@perq/shared";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { PlanForm } from "@/features/planner/PlanForm";
import { usePlannerToday } from "@/features/planner/today";
import { setPendingPlan, takeDraftToConfirm } from "@/lib/plannerApi";

// "Should I buy this?" (Step 3 §10.2, §10.3). Typed input, or the confirm
// step for details read from a screenshot, link or chat.
export default function NewPlan() {
  const today = usePlannerToday();
  const [confirm] = useState(() => takeDraftToConfirm());
  const source: PlanSource = confirm?.source ?? "typed";

  const go = (input: PlanInput) => {
    setPendingPlan({ input, source });
    router.push("/plan/running");
  };

  return (
    <Screen edges={[]}>
      {!confirm ? (
        <Text tone="muted">
          Tell me what you want to buy. I'll check your budget, cards and statement dates and tell you the best way and day to pay.
        </Text>
      ) : null}
      <PlanForm initial={confirm?.draft ?? { offers: [], emiOptions: [] }} today={today} confirming={!!confirm && source !== "typed"} notes={confirm?.notes} onContinue={go} />
    </Screen>
  );
}
