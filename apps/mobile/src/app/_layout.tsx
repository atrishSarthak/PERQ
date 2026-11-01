import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  LexendDeca_400Regular,
  LexendDeca_500Medium,
  LexendDeca_600SemiBold,
} from "@expo-google-fonts/lexend-deca";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    LexendDeca_400Regular,
    LexendDeca_500Medium,
    LexendDeca_600SemiBold,
    "CabinetGrotesk-Bold": require("../../assets/fonts/CabinetGrotesk-Bold.ttf"),
    "CabinetGrotesk-Extrabold": require("../../assets/fonts/CabinetGrotesk-Extrabold.ttf"),
  });

  // A font failure falls back to the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  const t = useTheme();

  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === "loading") return null;
  const signedIn = status === "signedIn";

  return (
    <>
      <StatusBar style={t.name === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
          <Stack.Screen
            name="card/[id]"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "See the math",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="upload"
            options={{
              presentation: "modal",
              headerShown: true,
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="edit/[key]"
            options={{
              presentation: "modal",
              headerShown: true,
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
        </Stack.Protected>
        <Stack.Screen
          name="diagnostics"
          options={{
            presentation: "modal",
            headerShown: true,
            title: "Diagnostics",
            headerStyle: { backgroundColor: t.colors.surface },
            headerTintColor: t.colors.text,
          }}
        />
      </Stack>
    </>
  );
}
