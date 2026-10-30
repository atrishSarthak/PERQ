import * as SecureStore from "expo-secure-store";

// The mobile JWT lives in the iOS Keychain via expo-secure-store (handoff §0.6).
// SecureStore doesn't exist in the Expo web preview; there the token is kept
// in memory only (lost on reload), which is fine for a dev preview.
const TOKEN_KEY = "perq.session.token";

let cached: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function setToken(token: string): Promise<void> {
  cached = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
}

export async function clearToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}
