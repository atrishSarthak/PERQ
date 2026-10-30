import { describe, expect, it } from "vitest";
import { authResponseSchema, loginRequestSchema, signupRequestSchema } from "../src";

describe("auth schemas", () => {
  it("normalises email case and whitespace", () => {
    expect(signupRequestSchema.parse({ email: "  Me@Example.COM ", password: "longenough" }).email).toBe(
      "me@example.com"
    );
  });
  it("rejects short passwords on signup but not login", () => {
    expect(signupRequestSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
  });
  it("parses an auth response", () => {
    expect(
      authResponseSchema.parse({ token: "t", user: { id: "1", email: "a@b.co", name: null } }).user.id
    ).toBe("1");
  });
});
