import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ChatThread } from "@/features/chat/ChatThread";
import { useCardAccount, useConfirmProposal } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";

// A card thread (`card:<cardAccountId>`, handoff §10.4): Ember chat scoped to one card.
export default function CardThread() {
  const t = useTheme();
  const { ref: raw } = useLocalSearchParams<{ ref: string }>();
  const ref = decodeURIComponent(raw ?? "");
  const id = ref.startsWith("card:") ? ref.slice(5) : "";
  const detail = useCardAccount(id);
  const confirmProposal = useConfirmProposal();
  const label = detail.data?.account.cardLabel ?? "this card";
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: detail.data?.account.cardLabel ?? "Ember" }} />
      <ChatThread
        threadRef={ref}
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
