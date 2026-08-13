import { describe, expect, it, vi, beforeEach } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: { generateContent: generateContentMock },
    })),
  };
});

const { searchGroundedText, extractStructuredJson } = await import("../src/webSearch");

describe("searchGroundedText", () => {
  beforeEach(() => generateContentMock.mockReset());

  it("returns grounded text and deduped citation URIs from groundingChunks", async () => {
    generateContentMock.mockResolvedValue({
      text: "Some cited research findings.",
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://bank-a.example/card", title: "Bank A Card" } },
              { web: { uri: "https://bank-b.example/card", title: "Bank B Card" } },
              { web: { uri: "https://bank-a.example/card", title: "Bank A Card (dup)" } },
            ],
          },
        },
      ],
    });

    const result = await searchGroundedText("test-key", "find cards");

    expect(result.text).toBe("Some cited research findings.");
    expect(result.citations).toEqual([
      { uri: "https://bank-a.example/card", title: "Bank A Card" },
      { uri: "https://bank-b.example/card", title: "Bank B Card" },
    ]);
  });

  it("passes the googleSearch tool in the request config", async () => {
    generateContentMock.mockResolvedValue({ text: "", candidates: [] });
    await searchGroundedText("test-key", "find cards");

    const [call] = generateContentMock.mock.calls[0]!;
    expect(call.config.tools).toEqual([{ googleSearch: {} }]);
  });

  it("returns no citations when groundingMetadata is absent", async () => {
    generateContentMock.mockResolvedValue({ text: "ungrounded text", candidates: [{}] });
    const result = await searchGroundedText("test-key", "find cards");
    expect(result.citations).toEqual([]);
  });
});

describe("extractStructuredJson", () => {
  beforeEach(() => generateContentMock.mockReset());

  it("parses the model's JSON text response", async () => {
    generateContentMock.mockResolvedValue({ text: '[{"name":"Test Card"}]' });

    const result = await extractStructuredJson("test-key", "extract cards", {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" } } },
    });

    expect(result).toEqual([{ name: "Test Card" }]);
  });

  it("requests JSON mode, converting the SDK-agnostic schema to the genai Schema shape", async () => {
    generateContentMock.mockResolvedValue({ text: "[]" });
    await extractStructuredJson("test-key", "extract cards", {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    });

    const [call] = generateContentMock.mock.calls[0]!;
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseSchema).toEqual({
      type: "ARRAY",
      properties: undefined,
      required: undefined,
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING", properties: undefined, required: undefined, items: undefined, nullable: undefined } },
        required: ["name"],
        items: undefined,
        nullable: undefined,
      },
      nullable: undefined,
    });
  });
});
