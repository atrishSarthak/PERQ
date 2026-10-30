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

// Gemini's free/shared tier throws a 429 (ClientError, RESOURCE_EXHAUSTED)
// once a model's own RPM/RPD quota is hit — distinct from a transient 503:
// backing off and retrying the SAME model wastes the wait, since the quota
// resets on a clock, not on retry count. withModelFallback below routes
// this to the next model in the chain instead, which has its own separate
// quota bucket.
export function isRateLimitError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "ClientError" &&
    /"status":\s*"RESOURCE_EXHAUSTED"|got status: 429/.test(err.message)
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

/**
 * Spreads load across a chain of models instead of hammering one — each
 * Gemini model name is its own separate RPM/TPM/RPD quota bucket, so a
 * model that's rate-limited (429/RESOURCE_EXHAUSTED) or persistently
 * unavailable (503, after withTransientRetry's own retries are exhausted)
 * can hand off to the next model in `models` immediately rather than
 * surfacing a hard failure to the user. Any other error (bad request, auth
 * failure) rethrows right away — switching models won't fix a malformed
 * request.
 */
export async function withModelFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    try {
      return await withTransientRetry(() => attempt(models[i]!));
    } catch (err) {
      lastErr = err;
      const hasNextModel = i < models.length - 1;
      const canFallOver = isRateLimitError(err) || isTransientServerError(err);
      const willFallBack = hasNextModel && canFallOver;
      // Logged unconditionally (not just when giving up) — this is the one
      // signal that makes a quota exhaustion pattern diagnosable in
      // production instead of just "the feature is broken" reports. Cheap:
      // only fires on an actual failure, never on the happy path.
      console.error(
        `[withModelFallback] ${models[i]} failed (rateLimit=${isRateLimitError(err)}, transient=${isTransientServerError(err)}, ${willFallBack ? "falling back to " + models[i + 1] : "not retrying, rethrowing"}):`,
        err instanceof Error ? err.message : err
      );
      if (!willFallBack) throw err;
    }
  }
  throw lastErr;
}
