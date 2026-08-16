import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  JsonSchema,
  ModelCallInput,
  ModelCallOutput,
  ModelCaller,
} from "./types";
import { withTransientRetry } from "./retry";

// PRD §3/§15: pin the exact model identifier and confirm current free-tier
// quota (RPM/RPD/TPM) in Google AI Studio at implementation time — don't
// hardcode a number that will go stale. Verified against the live API
// (2026-08-12): "gemini-2.0-flash" is already deprecated/removed
// (404 "no longer available"). "gemini-flash-latest" is Google's own
// maintained alias to the current recommended Flash-tier model — it
// resolves the staleness problem structurally rather than requiring a
// code change every time Google rotates model names. Still overridable
// via GEMINI_MODEL for a deliberate pin later.
const DEFAULT_MODEL = "gemini-flash-latest";

// Our own JsonSchema stays SDK-agnostic (types.ts has zero external
// dependencies) — this is the one place that adapts it to the genai SDK's
// stricter Schema shape. Tool authors (apps/web/lib/mimir) are responsible
// for supplying properties shaped like genai's Schema; a runtime mismatch
// surfaces as a Gemini API error, not a silent miscast.
function toGenAiSchema(schema: JsonSchema): Schema {
  return {
    type: Type.OBJECT,
    properties: schema.properties as Record<string, Schema>,
    required: schema.required,
  };
}

/**
 * Wraps the real Gemini SDK as a ModelCaller (the same shape
 * runGeminiAgent's tests inject a mock for). Only instantiated in apps/web
 * where GEMINI_API_KEY is actually available — packages/ai itself never
 * requires the key to be built or unit-tested.
 */
export function createGeminiModelCaller(
  apiKey: string,
  modelName: string = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
): ModelCaller {
  const client = new GoogleGenAI({ apiKey });

  return async (input: ModelCallInput): Promise<ModelCallOutput> => {
    const contents = [
      ...input.history.map((turn) => ({
        role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: turn.content }],
      })),
      ...(input.toolResults.length > 0
        ? [
            {
              role: "user" as const,
              parts: [
                {
                  text: `Tool results from prior steps:\n${JSON.stringify(input.toolResults, null, 2)}`,
                },
              ],
            },
          ]
        : []),
    ];

    // Gemini requires at least one content turn — a caller with no chat
    // history and no tool results yet (the very first call of a fresh
    // agent run) would otherwise send an empty array and get a 400.
    // systemInstruction alone isn't a turn.
    if (contents.length === 0) {
      contents.push({
        role: "user" as const,
        parts: [{ text: "Begin." }],
      });
    }

    const response = await withTransientRetry(() =>
      client.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: input.systemPrompt,
          tools:
            input.toolDeclarations.length > 0
              ? [
                  {
                    functionDeclarations: input.toolDeclarations.map((tool) => ({
                      name: tool.name,
                      description: tool.description,
                      parameters: toGenAiSchema(tool.parameters),
                    })),
                  },
                ]
              : undefined,
        },
      })
    );

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      return {
        type: "function_calls",
        calls: functionCalls.map((call) => ({
          name: call.name ?? "",
          args: (call.args ?? {}) as Record<string, unknown>,
        })),
      };
    }

    return { type: "text", text: response.text ?? "" };
  };
}
