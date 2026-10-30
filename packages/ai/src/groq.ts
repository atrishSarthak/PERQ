import type { ResponseSchema } from "./types";

// A genuinely separate INFERENCE provider (not another Gemini model) —
// used as the last-resort fallback for extraction/reasoning calls when
// every Gemini model's own quota is exhausted. Groq has no built-in web
// search/grounding tool (that's what firecrawlSearch.ts covers instead) —
// this is only for turning already-gathered text into structured JSON, the
// same job extractStructuredJson (webSearch.ts) does for Gemini.

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

// Verified against the live API (2026-08-21): Groq's model lineup has
// moved on from the older Llama 3.x names (now 404 "model_not_found") to
// hosting other open-weight models — gpt-oss-120b is the strongest
// currently-available option for extraction accuracy. Overridable via
// GROQ_MODEL for whenever Groq's lineup shifts again, same pattern as
// GEMINI_MODEL in client.ts/webSearch.ts.
const DEFAULT_MODEL = "openai/gpt-oss-120b";

/**
 * Groq's OpenAI-compatible JSON mode (response_format: json_object)
 * guarantees valid JSON but — unlike Gemini's responseSchema — has no way
 * to enforce a specific shape, and requires the root to be a JSON *object*
 * (a bare top-level array is rejected). So: describe the shape as a typed
 * example in the prompt text, and for an array-rooted schema, ask for
 * {"items": [...]} and unwrap it after parsing — the standard workaround
 * for JSON-mode APIs that can't emit a bare array at the root.
 */
function describeShape(schema: ResponseSchema): unknown {
  if (schema.type === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      out[key] = describeShape(value);
    }
    return out;
  }
  if (schema.type === "array") {
    return schema.items ? [describeShape(schema.items)] : [];
  }
  return schema.nullable ? `${schema.type} | null` : schema.type;
}

export async function extractStructuredJsonGroq(
  apiKey: string,
  prompt: string,
  schema: ResponseSchema,
  modelName: string = process.env.GROQ_MODEL ?? DEFAULT_MODEL
): Promise<unknown> {
  const isArrayRoot = schema.type === "array";
  const effectiveSchema: ResponseSchema = isArrayRoot
    ? { type: "object", properties: { items: schema }, required: ["items"] }
    : schema;

  const shapeDescription = JSON.stringify(describeShape(effectiveSchema), null, 2);
  const requiredList =
    effectiveSchema.type === "object" && effectiveSchema.required?.length
      ? effectiveSchema.required.join(", ")
      : "(none)";

  const fullPrompt = `${prompt}\n\n---\nRespond with ONLY a single JSON object (no prose, no markdown code fences) matching exactly this shape. The values shown below are TYPES, not literal values to copy:\n${shapeDescription}\n\nRequired fields: ${requiredList}`;

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: fullPrompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq request returned ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);

  return isArrayRoot ? ((parsed as { items?: unknown }).items ?? []) : parsed;
}
