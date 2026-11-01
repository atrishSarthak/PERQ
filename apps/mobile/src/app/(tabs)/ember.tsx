import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Text } from "@/components/Text";
import { ChatThread } from "@/features/chat/ChatThread";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

export default function EmberTab() {
  const t = useTheme();
  const results = useResults();
  const ranked = results.data?.result.ranked ?? [];
  const chips = [
    ranked[1] ? `Why not ${ranked[1].name}?` : null,
    "Where did my money go last month?",
    ranked[0] && !ranked[0].flags.lifetimeFree ? "Is the fee worth it?" : "What if I travel more?",
  ]
    .filter(Boolean)
    .map((label) => ({ label: label as string, action: null }));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ChatThread
        chips={chips}
        emptyText="Ask me why a card ranked where it did, where your money went, or which card to use. I only use the numbers PERQ computed for you."
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3], paddingHorizontal: t.spacing[5], paddingVertical: t.spacing[3] }}>
            <EmberAvatar size={36} />
            <View>
              <Text variant="heading">Ember</Text>
              <Text variant="caption" tone="muted">
                Answers from your statements, your answers and verified card terms
              </Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}
