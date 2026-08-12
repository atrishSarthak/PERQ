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
