import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";

export default function Welcome() {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flex: 1, padding: t.spacing[6], justifyContent: "space-between" }}>
        <View style={{ marginTop: t.spacing[16], gap: t.spacing[6] }}>
          {/* Long-press the logo for Diagnostics: handy before you can sign in. */}
          <Pressable onLongPress={() => router.push("/diagnostics")} accessibilityHint="Long-press for diagnostics">
            <Text variant="display" style={{ letterSpacing: 2 }}>
              PERQ
            </Text>
          </Pressable>
          <Text variant="title">Get more from the cards you use</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
            <EmberAvatar size={32} />
            <Text tone="muted" style={{ flex: 1 }}>
              Ember works out what each card is worth to you, in rupees a year.
            </Text>
          </View>
        </View>
        <View style={{ gap: t.spacing[3] }}>
          <Button label="Sign up" onPress={() => router.push("/sign-up")} />
          <Button label="Sign in" kind="secondary" onPress={() => router.push("/sign-in")} />
        </View>
      </View>
    </SafeAreaView>
  );
}
