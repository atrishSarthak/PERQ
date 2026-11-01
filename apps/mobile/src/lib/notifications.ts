import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { moneyApi } from "./moneyApi";

// Nudge delivery on the device (handoff §7.3).
// - "push": a build with an EAS projectId gets an Expo push token, which the
//   server uses for remote push.
// - "local": Expo Go without a projectId can't get a token, so the app
//   schedules the server's 7-day plan (/api/nudges/upcoming) as local
//   notifications each time it syncs (DECISIONS).
// The in-app inbox works either way.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ASKED_KEY = "perq.notifications.asked";

export type DeliveryMode = "push" | "local" | "none";

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export function deliveryMode(): DeliveryMode {
  if (Platform.OS === "web") return "none";
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  // Remote push left Expo Go on Android in SDK 53; iOS needs a projectId.
  if (projectId() && !(expoGo && Platform.OS === "android")) return "push";
  return "local";
}

export async function hasAskedForNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  return (await SecureStore.getItemAsync(ASKED_KEY).catch(() => null)) === "1";
}

async function markAsked() {
  await SecureStore.setItemAsync(ASKED_KEY, "1").catch(() => {});
}

async function permissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/** Called from the explainer screen: consent, OS permission, then token or local schedule. */
export async function enableNotifications(): Promise<boolean> {
  await markAsked();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("nudges", { name: "Ember nudges", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let granted = await permissionGranted();
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).status === "granted";
  await moneyApi.giveConsent("notifications", granted);
  if (granted) await syncNotifications();
  return granted;
}

export async function declineNotifications(): Promise<void> {
  await markAsked();
  await moneyApi.giveConsent("notifications", false);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

/** Run on sign-in and whenever the app comes to the foreground. */
export async function syncNotifications(): Promise<void> {
  const mode = deliveryMode();
  if (mode === "none" || !(await permissionGranted())) return;
  if (mode === "push") {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId()! })).data;
    await moneyApi.registerPush(token, Platform.OS === "ios" ? "ios" : "android");
    return;
  }
  const { upcoming } = await moneyApi.upcomingNudges();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  for (const n of upcoming) {
    const at = new Date(n.at);
    if (at.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { url: `/nudge/${encodeURIComponent(`key:${n.dedupeKey}`)}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}

/** Path inside the app for a tapped notification (remote: perq://nudge/<id>; local: /nudge/key:<dedupeKey>). */
export function pathForNotification(data: unknown): string | null {
  const url = (data as { url?: unknown } | undefined)?.url;
  if (typeof url !== "string") return null;
  if (url.startsWith("perq://")) return `/${url.slice("perq://".length)}`;
  return url.startsWith("/") ? url : null;
}
