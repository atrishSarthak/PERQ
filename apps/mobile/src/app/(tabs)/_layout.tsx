import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Loading } from "@/components/StateViews";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// The system tab bar (Liquid Glass on iOS 26), with the selected tab in red.
// The glass floats over each screen, so screens keep their content clear of it
// (Screen's scroll inset, a bottom safe-area edge on the chat and cards tabs).
export default function TabsLayout() {
  const t = useTheme();
  const results = useResults();
  // No saved answers yet (or an unreadable old profile) → the quiz first.
  if (results.isLoading) return <Loading />;
  if (results.data === null) return <Redirect href="/quiz" />;
  const content = { backgroundColor: t.colors.bg };
  return (
    <NativeTabs tintColor={t.colors.ember} labelStyle={{ selected: { color: t.colors.emberText } }}>
      <NativeTabs.Trigger name="index" contentStyle={content}>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ember" contentStyle={content}>
        <NativeTabs.Trigger.Label>Ember</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "flame", selected: "flame.fill" }} md="local_fire_department" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards" contentStyle={content}>
        <NativeTabs.Trigger.Label>Cards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "creditcard", selected: "creditcard.fill" }} md="credit_card" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" contentStyle={content}>
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
