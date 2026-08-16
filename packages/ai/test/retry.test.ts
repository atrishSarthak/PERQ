import { describe, expect, it, vi } from "vitest";
import { withTransientRetry, isTransientServerError, MAX_TRANSIENT_RETRIES } from "../src/retry";

function transientError(): Error {
  const err = new Error('got status: 503 Service Unavailable. {"status":"UNAVAILABLE"}');
  err.name = "ServerError";
  return err;
}

describe("isTransientServerError", () => {
  it("recognizes a 503 ServerError as transient", () => {
    expect(isTransientServerError(transientError())).toBe(true);
  });

  it("does not treat a plain error as transient", () => {
    expect(isTransientServerError(new Error("bad request"))).toBe(false);
  });

  it("does not treat a non-Error throw as transient", () => {
    expect(isTransientServerError("some string")).toBe(false);
  });
});

describe("withTransientRetry", () => {
  it("returns the result on first success, no retry", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const result = await withTransientRetry(attempt);
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a transient error and succeeds on a later attempt", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce("ok");

    const result = await withTransientRetry(attempt);
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after MAX_TRANSIENT_RETRIES and rethrows", async () => {
    const attempt = vi.fn().mockRejectedValue(transientError());

    await expect(withTransientRetry(attempt)).rejects.toThrow();
    expect(attempt).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES + 1);
  });

  it("does not retry a non-transient error", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("bad request"));

    await expect(withTransientRetry(attempt)).rejects.toThrow("bad request");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
