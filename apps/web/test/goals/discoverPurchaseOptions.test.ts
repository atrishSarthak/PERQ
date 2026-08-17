import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GoalFacts } from "@/lib/goals/understandGoal";

const searchGroundedTextMock = vi.fn();
const extractStructuredJsonMock = vi.fn();

vi.mock("@perq/ai", () => ({
  searchGroundedText: (...args: unknown[]) => searchGroundedTextMock(...args),
  extractStructuredJson: (...args: unknown[]) => extractStructuredJsonMock(...args),
}));

const { discoverPurchaseOptions, MAX_DISCOVERED_OFFERS } = await import(
  "@/lib/goals/discoverPurchaseOptions"
);

const FACTS: GoalFacts = {
  summary: "iPhone 15",
  subject: "iPhone 15",
  location: null,
  variant: null,
  budgetHint: null,
};

const CITATIONS = [
  { uri: "https://flipkart.com/iphone-15", title: "Flipkart" },
  { uri: "https://amazon.in/iphone-15", title: "Amazon" },
];

function makeRawOffer(overrides: Record<string, unknown> = {}) {
  return {
    title: "iPhone 15",
    price: 57749,
    sourceUrl: "https://flipkart.com/iphone-15",
    sourceLabel: "Flipkart",
    ...overrides,
  };
}

describe("discoverPurchaseOptions", () => {
  beforeEach(() => {
    searchGroundedTextMock.mockReset();
    extractStructuredJsonMock.mockReset();
  });

  it("returns no offers when the grounded search yields no citations", async () => {
    searchGroundedTextMock.mockResolvedValue({ text: "some text", citations: [] });

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result).toEqual({ offers: [], cardOfferNote: null, cardOfferCitationUrl: null });
    expect(extractStructuredJsonMock).not.toHaveBeenCalled();
  });

  it("drops an offer whose sourceUrl doesn't match any real citation (fabricated URL)", async () => {
    searchGroundedTextMock.mockResolvedValueOnce({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawOffer({ sourceUrl: "https://made-up.example/fake" }),
    ]);

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers).toEqual([]);
    // No card-offer search runs when nothing real was found.
    expect(searchGroundedTextMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a validated, citation-backed offer", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({ text: "no offer notes", citations: [] });
    extractStructuredJsonMock.mockResolvedValue([makeRawOffer()]);

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]!.sourceLabel).toBe("Flipkart");
  });

  it("allows a null price when grounding didn't state a firm number", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({ text: "", citations: [] });
    extractStructuredJsonMock.mockResolvedValue([makeRawOffer({ price: null })]);

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers[0]!.price).toBeNull();
  });

  it("drops one malformed offer without discarding the rest of the batch", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({ text: "", citations: [] });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawOffer({ title: "Good listing" }),
      { title: "Bad listing" }, // missing required sourceUrl/sourceLabel
    ]);

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]!.title).toBe("Good listing");
  });

  it("dedupes offers sharing the same sourceUrl", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({ text: "", citations: [] });
    extractStructuredJsonMock.mockResolvedValue([makeRawOffer(), makeRawOffer()]);

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers).toHaveLength(1);
  });

  it(`caps the result at ${MAX_DISCOVERED_OFFERS} offers`, async () => {
    const manyCitations = Array.from({ length: 20 }, (_, i) => ({
      uri: `https://flipkart.com/iphone-15?v=${i}`,
      title: `Listing ${i}`,
    }));
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: manyCitations })
      .mockResolvedValueOnce({ text: "", citations: [] });
    extractStructuredJsonMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        makeRawOffer({ sourceUrl: `https://flipkart.com/iphone-15?v=${i}`, title: `Listing ${i}` })
      )
    );

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.offers).toHaveLength(MAX_DISCOVERED_OFFERS);
  });

  it("only surfaces a card offer note when it's attributed to a real citation from the offer search itself", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({
        text: "offer notes",
        citations: [{ uri: "https://flipkart.com/offers", title: "Offers" }],
      });
    extractStructuredJsonMock
      .mockResolvedValueOnce([makeRawOffer()])
      .mockResolvedValueOnce({
        found: true,
        note: "10% instant discount with HDFC cards.",
        citationUrl: "https://flipkart.com/offers",
      });

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.cardOfferNote).toBe("10% instant discount with HDFC cards.");
    expect(result.cardOfferCitationUrl).toBe("https://flipkart.com/offers");
  });

  it("drops a card offer note attributed to a URL not in that search's own citations", async () => {
    searchGroundedTextMock
      .mockResolvedValueOnce({ text: "notes", citations: CITATIONS })
      .mockResolvedValueOnce({
        text: "offer notes",
        citations: [{ uri: "https://flipkart.com/offers", title: "Offers" }],
      });
    extractStructuredJsonMock
      .mockResolvedValueOnce([makeRawOffer()])
      .mockResolvedValueOnce({
        found: true,
        note: "invented offer",
        citationUrl: "https://made-up.example/fake-offer",
      });

    const result = await discoverPurchaseOptions(FACTS, "test-key");
    expect(result.cardOfferNote).toBeNull();
  });

  it("never runs the card-offer search when the main discovery found nothing valid", async () => {
    searchGroundedTextMock.mockResolvedValueOnce({ text: "notes", citations: CITATIONS });
    extractStructuredJsonMock.mockResolvedValue([
      makeRawOffer({ sourceUrl: "https://made-up.example/fake" }),
    ]);

    await discoverPurchaseOptions(FACTS, "test-key");
    expect(searchGroundedTextMock).toHaveBeenCalledTimes(1);
  });
});
