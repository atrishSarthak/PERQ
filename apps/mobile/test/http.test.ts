import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, createHttp } from "../src/lib/http";

const schema = z.object({ ok: z.literal(true) });

function deps(response: Response | Error, token: string | null = "tok") {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const onUnauthorized = vi.fn();
  const http = createHttp({ baseUrl: "http://api.test", fetch: fetch as never, getToken: async () => token, onUnauthorized });
  return { http, fetch, onUnauthorized };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("API client", () => {
  it("sends the Bearer token and parses a valid response", async () => {
    const { http, fetch } = deps(json({ ok: true }));
    await expect(http.request("/api/health", { schema })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/health");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("omits the token for auth: false calls and JSON-encodes the body", async () => {
    const { http, fetch } = deps(json({ ok: true }));
    await http.request("/x", { method: "POST", body: { a: 1 }, schema, auth: false });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.body).toBe('{"a":1}');
  });

  it("surfaces the server's error message and calls onUnauthorized on 401", async () => {
    const { http, onUnauthorized } = deps(json({ error: "Unauthorized" }, 401));
    await expect(http.request("/x", { schema })).rejects.toMatchObject({ message: "Unauthorized", status: 401, kind: "http" });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("rejects a response that doesn't match the schema", async () => {
    const { http } = deps(json({ ok: "yes" }));
    await expect(http.request("/x", { schema })).rejects.toMatchObject({ kind: "parse" });
  });

  it("reports network failures with the server URL", async () => {
    const { http } = deps(new TypeError("Network request failed"));
    const err = await http.request("/x", { schema }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("network");
    expect(err.message).toContain("http://api.test");
  });

  it("refuses to run without an API URL", async () => {
    const http = createHttp({ baseUrl: "", fetch: vi.fn() as never, getToken: async () => null });
    await expect(http.request("/x", { schema })).rejects.toMatchObject({ kind: "config" });
  });
});
