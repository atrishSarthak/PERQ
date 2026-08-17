import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DiscoveredOffer } from "@/lib/goals/discoverySchema";

const fetchPageMock = vi.fn();
vi.mock("@perq/fetch", () => ({ fetchPage: (...args: unknown[]) => fetchPageMock(...args) }));

const extractStructuredJsonMock = vi.fn();
vi.mock("@perq/ai", () => ({
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
}));

const { refinePricesWithPrecisionFetch, MAX_PRECISION_FETCHES } = await import(
  "@/lib/goals/precisionFetch"
);

function offer(overrides: Partial<DiscoveredOffer> = {}): DiscoveredOffer {
  return {
    title: "iPhone 15",
    price: null,
    sourceUrl: "https://flipkart.com/iphone-15",
    sourceLabel: "Flipkart",
    ...overrides,
  };
}

beforeEach(() => {
  fetchPageMock.mockReset();
  extractStructuredJsonMock.mockReset();
});

describe("refinePricesWithPrecisionFetch", () => {
  it("never fetches an offer that already has a price", async () => {
    const offers = [offer({ price: 57749 })];
    const result = await refinePricesWithPrecisionFetch(offers, "key");
    expect(fetchPageMock).not.toHaveBeenCalled();
    expect(result).toEqual(offers);
  });

  it("fetches and fills in a real price for a price-less offer", async () => {
    fetchPageMock.mockResolvedValue({ success: true, markdown: "iPhone 15 is ₹57,749" });
    extractStructuredJsonMock.mockResolvedValue({ found: true, price: 57749 });

    const result = await refinePricesWithPrecisionFetch([offer()], "key");
    expect(result[0]!.price).toBe(57749);
  });

  it("keeps the offer (never discards it) when the fetch fails", async () => {
    fetchPageMock.mockResolvedValue({ success: false, error: "blocked", transient: false });

    const result = await refinePricesWithPrecisionFetch([offer()], "key");
    expect(result).toHaveLength(1);
    expect(result[0]!.price).toBeNull();
  });

  it("keeps the offer (never discards it) when extraction finds no real price", async () => {
    fetchPageMock.mockResolvedValue({ success: true, markdown: "no price on this page" });
    extractStructuredJsonMock.mockResolvedValue({ found: false });

    const result = await refinePricesWithPrecisionFetch([offer()], "key");
    expect(result).toHaveLength(1);
    expect(result[0]!.price).toBeNull();
  });

  it("keeps the offer (never discards it) when extraction throws", async () => {
    fetchPageMock.mockResolvedValue({ success: true, markdown: "content" });
    extractStructuredJsonMock.mockRejectedValue(new Error("quota exhausted"));

    const result = await refinePricesWithPrecisionFetch([offer()], "key");
    expect(result).toHaveLength(1);
    expect(result[0]!.price).toBeNull();
  });

  it(`only fetches the first ${MAX_PRECISION_FETCHES} price-less offers`, async () => {
    fetchPageMock.mockResolvedValue({ success: true, markdown: "content" });
    extractStructuredJsonMock.mockResolvedValue({ found: true, price: 100 });

    const offers = Array.from({ length: MAX_PRECISION_FETCHES + 2 }, (_, i) =>
      offer({ sourceUrl: `https://flipkart.com/x${i}` })
    );

    await refinePricesWithPrecisionFetch(offers, "key");
    expect(fetchPageMock).toHaveBeenCalledTimes(MAX_PRECISION_FETCHES);
  });

  it("passes the optional Jina API key through to fetchPage", async () => {
    fetchPageMock.mockResolvedValue({ success: true, markdown: "content" });
    extractStructuredJsonMock.mockResolvedValue({ found: true, price: 100 });

    await refinePricesWithPrecisionFetch([offer()], "key", "jina-key");
    expect(fetchPageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ apiKey: "jina-key" })
    );
  });
});
