// Per-IP sliding-window limit for the public, no-login card finder
// (handoff §1.5). In-memory, so on Vercel it limits per warm instance; that
// is enough to stop a casual script without adding a store (DECISIONS.md).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** true if this request is allowed; records it. */
export function allowRequest(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear(); // bound memory
  return true;
}

export const PUBLIC_RATE_LIMIT = { windowMs: WINDOW_MS, max: MAX_REQUESTS };
