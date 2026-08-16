import { describe, expect, it } from "vitest";
import { buildSearchUrl } from "@/lib/goals/channels";

describe("buildSearchUrl", () => {
  it("builds bookmyshow's real working city-listing URL, not a nonexistent search endpoint", () => {
    // T0 (2026-08-16, live Firecrawl test): /search?q= returns a soft-404
    // on bookmyshow — /explore/movies-{city} is the real, working pattern.
    const url = buildSearchUrl("bookmyshow", {
      category: "movie",
      movieName: "Oppenheimer",
      city: "Mumbai",
    });
    expect(url).toBe("https://in.bookmyshow.com/explore/movies-mumbai");
  });

  it("builds district's real working city-listing URL, not the non-filtering search endpoint", () => {
    // T0 finding: district's ?q= param returns byte-identical output
    // regardless of query content — /{city}/movies is the real pattern.
    const url = buildSearchUrl("district", {
      category: "movie",
      movieName: "Oppenheimer",
      city: "Mumbai",
    });
    expect(url).toBe("https://www.district.in/mumbai/movies");
  });

  it("maps Bangalore to BookMyShow/District's bengaluru slug", () => {
    expect(
      buildSearchUrl("bookmyshow", { category: "movie", movieName: "X", city: "Bangalore" })
    ).toBe("https://in.bookmyshow.com/explore/movies-bengaluru");
    expect(
      buildSearchUrl("district", { category: "movie", movieName: "X", city: "Bangalore" })
    ).toBe("https://www.district.in/bengaluru/movies");
  });

  it("builds klook/getyourguide query-based search URLs (verified working, T0)", () => {
    const entities = { category: "attraction" as const, attractionName: "Louvre Museum", city: "Paris" };
    expect(buildSearchUrl("klook", entities)).toBe(
      "https://www.klook.com/search/result/?query=Louvre%20Museum%20Paris"
    );
    expect(buildSearchUrl("getyourguide", entities)).toBe(
      "https://www.getyourguide.com/s/?q=Louvre%20Museum%20Paris"
    );
  });

  it("builds flipkart's query-based search URL (verified working, T0)", () => {
    const url = buildSearchUrl("flipkart", { category: "electronics", productName: "iPhone 15" });
    expect(url).toBe("https://www.flipkart.com/search?q=iPhone%2015");
  });

  it("builds amazon's search URL even though T0 confirmed it's reliably blocked", () => {
    // Left in place per PRD §6's locked channel list — D5's failure
    // taxonomy is what handles the near-certain 'failed' outcome honestly,
    // not a code-level workaround here.
    const url = buildSearchUrl("amazon", { category: "electronics", productName: "iPhone 15" });
    expect(url).toBe("https://www.amazon.in/s?k=iPhone%2015");
  });
});
