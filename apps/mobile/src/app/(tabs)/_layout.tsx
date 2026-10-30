import { Redirect, Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";
import { Loading } from "@/components/StateViews";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

function icon(name: SymbolViewProps["name"]) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={24} />;
}

export default function TabsLayout() {
  const t = useTheme();
  const results = useResults();
  // No saved answers yet (or an unreadable old profile) → the quiz first.
  if (results.isLoading) return <Loading />;
  if (results.data === null) return <Redirect href="/quiz" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.ember,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
        tabBarLabelStyle: { fontFamily: t.fonts.bodyMedium, fontSize: 11 },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon({ ios: "house.fill", android: "home", web: "home" }) }} />
      <Tabs.Screen name="ember" options={{ title: "Ember", tabBarIcon: icon({ ios: "flame.fill", android: "local_fire_department", web: "local_fire_department" }) }} />
      <Tabs.Screen name="cards" options={{ title: "Cards", tabBarIcon: icon({ ios: "creditcard.fill", android: "credit_card", web: "credit_card" }) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon({ ios: "person.crop.circle", android: "person", web: "person" }) }} />
    </Tabs>
  );
}
