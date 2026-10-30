import { Stack } from "expo-router";
import { useTheme } from "@/theme/ThemeProvider";

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitle: "",
        headerTintColor: t.colors.text,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
