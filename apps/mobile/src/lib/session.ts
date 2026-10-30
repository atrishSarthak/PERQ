import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// The mobile JWT lives in the iOS Keychain via expo-secure-store (handoff
// §0.6). SecureStore doesn't exist in the Expo web preview, so there it falls
// back to localStorage (dev preview only; the iPhone always uses Keychain).
const TOKEN_KEY = "perq.session.token";
const web = Platform.OS === "web";

let cached: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = web ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function setToken(token: string): Promise<void> {
  cached = token;
  if (web) globalThis.localStorage?.setItem(TOKEN_KEY, token);
  else await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
}

export async function clearToken(): Promise<void> {
  cached = null;
  if (web) globalThis.localStorage?.removeItem(TOKEN_KEY);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}
