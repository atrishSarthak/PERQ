import { and, eq, inArray } from "drizzle-orm";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db, pushTokens } from "@perq/db";
import { hasConsent } from "./consent";

// Remote push through Expo (handoff §7.3). Only for users who allowed
// notifications and registered a token. In Expo Go on iOS without an EAS
// projectId there is no token, so the app schedules local notifications
// instead (DECISIONS). Nothing about the nudge text is logged.

const expo = new Expo(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : {});

export async function pushNudges(userId: string, items: { id: string; title: string; body: string }[]): Promise<number> {
  if (!items.length) return 0;
  const tokens = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
  if (!tokens.length || !(await hasConsent(userId, "notifications"))) return 0;

  const messages: (ExpoPushMessage & { to: string })[] = [];
  for (const t of tokens) {
    if (!Expo.isExpoPushToken(t.expoToken)) continue;
    for (const n of items) {
      messages.push({ to: t.expoToken, title: n.title, body: n.body, sound: "default", data: { nudgeId: n.id, url: `perq://nudge/${n.id}` } });
    }
  }

  let sent = 0;
  const dead = new Set<string>();
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") dead.add((chunk[i] as { to: string }).to);
      });
    } catch (err) {
      console.error("expo push failed", { userId, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  if (dead.size) {
    await db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), inArray(pushTokens.expoToken, [...dead])));
  }
  return sent;
}
