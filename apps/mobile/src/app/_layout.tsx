import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
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
import { pathForNotification, syncNotifications } from "@/lib/notifications";
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

  useNotificationSync(status === "signedIn");

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
            name="notifications"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "Notifications",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="nudge/[id]"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "Ember noticed",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="account/[id]"
            options={{
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="transactions"
            options={{
              title: "Transactions",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="chat/[ref]"
            options={{
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="inbox"
            options={{
              title: "Ember's nudges",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="budgets"
            options={{
              title: "Budgets & goals",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="activity"
            options={{
              title: "What Ember did",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="privacy"
            options={{
              title: "Privacy & data",
              headerShown: true,
              headerBackTitle: "Back",
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
          <Stack.Screen
            name="plan/new"
            options={{
              title: "Should I buy this?",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen name="plan/running" options={{ gestureEnabled: false }} />
          <Stack.Screen
            name="plan/[id]"
            options={{
              title: "Your plan",
              headerShown: true,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: t.colors.surface },
              headerTintColor: t.colors.text,
              headerTitleStyle: { fontFamily: t.fonts.bodySemi },
            }}
          />
          <Stack.Screen
            name="plans"
            options={{
              title: "Your plans",
              headerShown: true,
              headerBackTitle: "Back",
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

/** Keeps the push token or the local schedule current, and opens tapped notifications. */
function useNotificationSync(signedIn: boolean) {
  useEffect(() => {
    // Notifications are native-only; the web preview keeps the in-app inbox.
    if (!signedIn || Platform.OS === "web") return;
    const sync = () => syncNotifications().catch(() => {});
    sync();
    const open = (data: unknown) => {
      const path = pathForNotification(data);
      if (path) router.push(path as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const tap = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    const app = AppState.addEventListener("change", (s) => s === "active" && sync());
    return () => {
      tap.remove();
      app.remove();
    };
  }, [signedIn]);
}
