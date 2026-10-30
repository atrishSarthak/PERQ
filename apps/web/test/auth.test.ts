// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => authMock(),
}));

const { requireAuth, isAuthed } = await import("../lib/auth");
const { NextResponse } = await import("next/server");

describe("requireAuth (2A)", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("returns a 401 NextResponse when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
  });

  it("returns a 401 NextResponse when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: {} });
    const result = await requireAuth();
    expect(isAuthed(result)).toBe(false);
  });

  it("returns the authed user when a valid session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "test@perq.app" },
    });
    const result = await requireAuth();
    expect(isAuthed(result)).toBe(true);
    if (isAuthed(result)) {
      expect(result.id).toBe("user-1");
      expect(result.email).toBe("test@perq.app");
    }
  });

  it("isAuthed narrows a NextResponse to false and a user object to true", () => {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    expect(isAuthed(res)).toBe(false);
    expect(isAuthed({ id: "x", email: null })).toBe(true);
  });
});

const { signMobileToken } = await import("../lib/mobileJwt");
const { getAuthedUser } = await import("../lib/auth");

describe("getAuthedUser with a mobile Bearer token (handoff §0.6)", () => {
  beforeEach(() => {
    authMock.mockReset();
    process.env.MOBILE_JWT_SECRET = "test-secret-that-is-definitely-long-enough-123";
  });

  const withBearer = (token: string) =>
    new Request("http://x/api", { headers: { authorization: `Bearer ${token}` } });

  it("accepts a valid token without touching the cookie session", async () => {
    const token = await signMobileToken("user-42");
    expect(await getAuthedUser(withBearer(token))).toEqual({ id: "user-42", email: null });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects a tampered token and never falls back to the cookie", async () => {
    authMock.mockResolvedValue({ user: { id: "cookie-user" } });
    const token = await signMobileToken("user-42");
    expect(await getAuthedUser(withBearer(token.slice(0, -2) + "xx"))).toBeNull();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signMobileToken("user-42");
    process.env.MOBILE_JWT_SECRET = "a-completely-different-secret-value-456789";
    expect(await getAuthedUser(withBearer(token))).toBeNull();
  });

  it("falls back to the Auth.js session when there is no Bearer header", async () => {
    authMock.mockResolvedValue({ user: { id: "cookie-user", email: "c@perq.app" } });
    expect(await getAuthedUser(new Request("http://x/api"))).toEqual({ id: "cookie-user", email: "c@perq.app" });
  });
});
