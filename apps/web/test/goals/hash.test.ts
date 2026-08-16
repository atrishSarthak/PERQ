import { describe, expect, it } from "vitest";
import { computeQueryKey, ttlMsForCategory } from "@/lib/goals/hash";

describe("computeQueryKey", () => {
  // dateScope() reads UTC fields (matching D8's UTC-calendar-day
  // convention), so fixtures pin an explicit UTC instant rather than a
  // local-timezone Date constructor, which would drift by a day depending
  // on the machine's own timezone offset.
  const today = new Date(Date.UTC(2026, 7, 16)); // 2026-08-16 UTC

  it("is date-scoped — the same movie/city on a different day produces a different key", () => {
    const key1 = computeQueryKey(
      "movie",
      { category: "movie", movieName: "Oppenheimer", city: "Bangalore" },
      today
    );
    const key2 = computeQueryKey(
      "movie",
      { category: "movie", movieName: "Oppenheimer", city: "Bangalore" },
      new Date(Date.UTC(2026, 7, 17))
    );
    expect(key1).not.toBe(key2);
  });

  it("normalizes case/whitespace so equivalent entities hash identically", () => {
    const key1 = computeQueryKey(
      "movie",
      { category: "movie", movieName: "Oppenheimer", city: "Bangalore" },
      today
    );
    const key2 = computeQueryKey(
      "movie",
      { category: "movie", movieName: "  oppenheimer  ", city: "BANGALORE" },
      today
    );
    expect(key1).toBe(key2);
  });

  it("uses productName for electronics, ignoring movie/attraction fields", () => {
    const key = computeQueryKey(
      "electronics",
      { category: "electronics", productName: "iPhone 15" },
      today
    );
    expect(key).toBe("electronics:iphone 15:2026-08-16");
  });

  it("uses attractionName + city for attractions", () => {
    const key = computeQueryKey(
      "attraction",
      { category: "attraction", attractionName: "Louvre", city: "Paris" },
      today
    );
    expect(key).toBe("attraction:louvre:paris:2026-08-16");
  });
});

describe("ttlMsForCategory", () => {
  it("gives electronics a longer TTL than movies/attractions", () => {
    expect(ttlMsForCategory("electronics")).toBeGreaterThan(ttlMsForCategory("movie"));
    expect(ttlMsForCategory("electronics")).toBeGreaterThan(ttlMsForCategory("attraction"));
  });
});
