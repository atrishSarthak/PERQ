// Wrong statement passwords: 5 per user per 10 minutes, then a cooldown
// (§5.2). In memory, so per warm instance on Vercel (same trade-off as the
// public finder's rate limit, DECISIONS #45).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRONG = 5;
const wrong = new Map<string, number[]>();

export function isPasswordLocked(userId: string, now = Date.now()): boolean {
  return (wrong.get(userId) ?? []).filter((t) => now - t < WINDOW_MS).length >= MAX_WRONG;
}

export function recordWrongPassword(userId: string, now = Date.now()) {
  wrong.set(userId, [...(wrong.get(userId) ?? []).filter((t) => now - t < WINDOW_MS), now]);
}

export function clearWrongPasswords(userId: string) {
  wrong.delete(userId);
}
