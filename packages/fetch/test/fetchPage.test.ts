import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchPage } from "../src/fetchPage";

const OPTIONS = { apiKey: "test-key", timeoutMs: 50, maxRetries: 1 };

describe("fetchPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns markdown on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, data: { content: "# Hello" } }), {
        status: 200,
      })
    );

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result).toEqual({ success: true, markdown: "# Hello" });
  });

  it("works without an API key", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, data: { content: "ok" } }), { status: 200 })
    );

    const result = await fetchPage("https://example.com", { timeoutMs: 50, maxRetries: 1 });
    expect(result).toEqual({ success: true, markdown: "ok" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("retries once on a transient 429 then succeeds", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { content: "ok" } }), { status: 200 })
      );

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result).toEqual({ success: true, markdown: "ok" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails after exhausting retries on repeated 503", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result.success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a hard 4xx (non-transient)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("bad request", { status: 400 })
    );

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result.success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 with no content as non-retryable", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 451, message: "blocked" }), { status: 200 })
    );

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result).toEqual({ success: false, error: "blocked", transient: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout as transient and retries once", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { content: "ok" } }), { status: 200 })
      );

    const result = await fetchPage("https://example.com", OPTIONS);
    expect(result).toEqual({ success: true, markdown: "ok" });
  });
});
