import * as SecureStore from "expo-secure-store";

// "Remember on this phone" (handoff §2): statement passwords live ONLY in the
// iOS Keychain via expo-secure-store, keyed by card. Never sent anywhere
// except inside a parse request, never stored on the server.
const INDEX_KEY = "perq.stmtpw.index";
const keyFor = (id: string) => `perq.stmtpw.${id.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export interface RememberedPassword {
  id: string; // issuer-last4
  label: string; // "HDFC Millennia ·4821"
}

async function readIndex(): Promise<RememberedPassword[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(INDEX_KEY)) ?? "[]");
  } catch {
    return [];
  }
}

export async function listRemembered(): Promise<RememberedPassword[]> {
  return readIndex();
}

export async function rememberPassword(entry: RememberedPassword, password: string): Promise<void> {
  await SecureStore.setItemAsync(keyFor(entry.id), password);
  const index = (await readIndex()).filter((e) => e.id !== entry.id);
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...index, entry]));
}

export async function getRememberedPassword(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(keyFor(id)).catch(() => null);
}

export async function forgetPassword(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(id)).catch(() => {});
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify((await readIndex()).filter((e) => e.id !== id)));
}

export async function forgetAllPasswords(): Promise<void> {
  for (const e of await readIndex()) await SecureStore.deleteItemAsync(keyFor(e.id)).catch(() => {});
  await SecureStore.deleteItemAsync(INDEX_KEY).catch(() => {});
}
