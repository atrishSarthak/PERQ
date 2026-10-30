import { describe, expect, it } from "vitest";
import { allowRequest, clientIp, PUBLIC_RATE_LIMIT } from "@/lib/rateLimitIp";

describe("public finder rate limit", () => {
  it("allows up to the limit per IP per window, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < PUBLIC_RATE_LIMIT.max; i++) expect(allowRequest("1.2.3.4", now + i)).toBe(true);
    expect(allowRequest("1.2.3.4", now + 100)).toBe(false);
    expect(allowRequest("5.6.7.8", now + 100)).toBe(true);
    expect(allowRequest("1.2.3.4", now + PUBLIC_RATE_LIMIT.windowMs + 200)).toBe(true);
  });

  it("reads the first x-forwarded-for address", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
  });
});
