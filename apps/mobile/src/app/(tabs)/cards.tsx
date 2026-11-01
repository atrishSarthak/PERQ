import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Segmented } from "@/components/Segmented";
import { Text } from "@/components/Text";
import { MyCards } from "@/features/money/MyCards";
import { ExploreList } from "@/features/results/ExploreList";
import { useMoneyState } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "mine" | "explore";

// Cards tab (handoff §10.3): My cards | Explore (the Step 1 recommender).
export default function CardsTab() {
  const t = useTheme();
  const state = useMoneyState();
  const hasCards = (state.data?.cards.length ?? 0) > 0;
  const [tab, setTab] = useState<Tab | null>(null);
  const current = tab ?? (hasCards ? "mine" : "explore");

  const header = (
    <>
      <Text variant="title" accessibilityRole="header">
        Cards
      </Text>
      <Segmented<Tab>
        value={current}
        onChange={setTab}
        options={[
          { value: "mine", label: "My cards" },
          { value: "explore", label: "Explore" },
        ]}
      />
    </>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {current === "mine" ? <MyCards header={header} /> : <ExploreList header={header} />}
    </SafeAreaView>
  );
}
