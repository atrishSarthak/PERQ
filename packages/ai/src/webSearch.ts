import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type { ResponseSchema } from "./types";
import { withTransientRetry } from "./retry";

// D15 (Feature 1 Engineering Plan amendment): a scoped, deliberate exception
// to D8's "tools execute in-process, no network hop" boundary — this is the
// one place a real external network call (Gemini's own Google Search
// grounding) enters the pipeline, and it happens BEFORE scoring, not as one
// of the in-process explanation-time tools in apps/web/lib/mimir/tools.ts.
//
// Kept feature-agnostic (D5) — no knowledge of cards/profiles here. Feature
// 1's card-search orchestration (query building, schema validation, citation
// checking) lives in apps/web/lib/mimir/cardSearch.ts.

const DEFAULT_MODEL = "gemini-flash-latest";

export interface Citation {
  uri: string;
  title?: string;
}

export interface GroundedSearchResult {
  text: string;
  citations: Citation[];
}

/**
 * Step A of the two-call pattern: Gemini's Google Search grounding tool
 * can't be combined with responseSchema/JSON mode in the same call (the API
 * returns grounded prose + citation metadata, not structured output), so
 * this call only produces cited research text — extractStructuredJson below
 * is a separate, second call that turns it into strict JSON.
 */
export async function searchGroundedText(
  apiKey: string,
  query: string,
  modelName: string = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
): Promise<GroundedSearchResult> {
  const client = new GoogleGenAI({ apiKey });

  const response = await withTransientRetry(() =>
    client.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    })
  );

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const citations: Citation[] = [];
  const seenUris = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    citations.push({ uri, title: chunk.web?.title });
  }

  return { text: response.text ?? "", citations };
}

const RESPONSE_TYPE_MAP: Record<ResponseSchema["type"], Type> = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
  integer: Type.INTEGER,
};

function toGenAiResponseSchema(schema: ResponseSchema): Schema {
  return {
    type: RESPONSE_TYPE_MAP[schema.type],
    properties: schema.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            toGenAiResponseSchema(value),
          ])
        )
      : undefined,
    required: schema.required,
    items: schema.items ? toGenAiResponseSchema(schema.items) : undefined,
    nullable: schema.nullable,
  };
}

/**
 * Step B: a plain (non-grounded) call constrained to a JSON schema — used to
 * turn Step A's cited prose into strict structured data. No tools, so it's
 * safe to combine with responseSchema.
 */
export async function extractStructuredJson(
  apiKey: string,
  prompt: string,
  schema: ResponseSchema,
  modelName: string = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey });

  const response = await withTransientRetry(() =>
    client.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: toGenAiResponseSchema(schema),
      },
    })
  );

  const text = response.text ?? "[]";
  return JSON.parse(text);
}
