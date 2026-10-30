import { Pressable } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth";
import { useThemeContext, type ThemePreference } from "@/theme/ThemeProvider";

export default function Profile() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useThemeContext();

  return (
    <Screen>
      {/* Hidden Diagnostics: long-press the title (handoff §0.7). */}
      <Pressable onLongPress={() => router.push("/diagnostics")} delayLongPress={600}>
        <Text variant="title">Profile</Text>
      </Pressable>
      <Text tone="muted">{user?.email}</Text>

      <Card>
        <Text variant="heading">Theme</Text>
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </Card>

      <Button label="Sign out" kind="secondary" onPress={signOut} />
    </Screen>
  );
}
