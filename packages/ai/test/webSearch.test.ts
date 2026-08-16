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

  // T0 finding (2026-08-16, live test): extractStructuredJson had no retry
  // at all, unlike client.ts's createGeminiModelCaller — a genuine
  // transient 503 hard-failed on the first attempt. Both now share
  // withTransientRetry (src/retry.ts).
  it("retries once on a transient 503 and succeeds", async () => {
    const transientErr = new Error(
      'got status: 503 Service Unavailable. {"status":"UNAVAILABLE"}'
    );
    transientErr.name = "ServerError";
    generateContentMock.mockRejectedValueOnce(transientErr).mockResolvedValueOnce({
      text: '{"found":true}',
    });

    const result = await extractStructuredJson("test-key", "extract", { type: "object" });

    expect(result).toEqual({ found: true });
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error", async () => {
    generateContentMock.mockReset();
    generateContentMock.mockRejectedValueOnce(new Error("invalid api key"));

    let caught: unknown;
    try {
      await extractStructuredJson("test-key", "extract", { type: "object" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("invalid api key");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});
