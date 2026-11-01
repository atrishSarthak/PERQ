import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ChatThread } from "@/features/chat/ChatThread";
import { useCardAccount, useConfirmProposal } from "@/lib/moneyQueries";
import { usePlan } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

// A scoped Ember thread: `card:<cardAccountId>` (handoff §10.4) or
// `plan:<planId>` (Step 3 §8), whose chips come from the server.
export default function ScopedThread() {
  const { ref: raw } = useLocalSearchParams<{ ref: string }>();
  const ref = decodeURIComponent(raw ?? "");
  return ref.startsWith("plan:") ? <PlanThread planId={ref.slice(5)} /> : <CardThread id={ref.startsWith("card:") ? ref.slice(5) : ""} />;
}

function PlanThread({ planId }: { planId: string }) {
  const t = useTheme();
  const plan = usePlan(planId);
  const confirmProposal = useConfirmProposal();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: plan.data?.plan.itemName ?? "Your plan" }} />
      <ChatThread threadRef={`plan:${planId}`} onConfirmProposal={confirmProposal} />
    </View>
  );
}

function CardThread({ id }: { id: string }) {
  const t = useTheme();
  const detail = useCardAccount(id);
  const confirmProposal = useConfirmProposal();
  const label = detail.data?.account.cardLabel ?? "this card";
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: detail.data?.account.cardLabel ?? "Ember" }} />
      <ChatThread
        threadRef={`card:${id}`}
        onConfirmProposal={confirmProposal}
        emptyText={`Ask about ${label}: its bill, utilisation, fees, points or which spends suit it.`}
        chips={[
          { label: `How am I doing on my ${label}?`, action: null },
          { label: `How much should I pay on my ${label} to get under 30%?`, action: null },
          { label: `What fees did my ${label} charge?`, action: null },
        ]}
      />
    </View>
  );
}
