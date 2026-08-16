// Shared transient-retry helper for Gemini API calls — factored out so
// client.ts's ModelCaller and webSearch.ts's extractStructuredJson/
// searchGroundedText don't each hand-roll the same retry loop (observed
// live during Feature 3's T0 spike: extractStructuredJson had NO retry at
// all and hard-failed on a genuine transient 503, while client.ts already
// had this exact protection — same failure mode, should have the same fix).

export const MAX_TRANSIENT_RETRIES = 2;
export const RETRY_BASE_DELAY_MS = 500;

// Gemini's free/shared-tier flash model returns a transient 503
// ("high demand") often enough in practice that surfacing it to the user
// on the first attempt is the wrong default — a couple of short retries
// clears most of them.
export function isTransientServerError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "ServerError" &&
    /"status":\s*"UNAVAILABLE"|got status: 503/.test(err.message)
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `attempt` with up to `MAX_TRANSIENT_RETRIES` retries, backing off
 * only on a transient server error — any other error (bad request, auth
 * failure, etc.) rethrows immediately since retrying won't help.
 */
export async function withTransientRetry<T>(attempt: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i >= MAX_TRANSIENT_RETRIES || !isTransientServerError(err)) throw err;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** i);
    }
  }
}
