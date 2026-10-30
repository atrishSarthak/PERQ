import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  JsonSchema,
  ModelCallInput,
  ModelCallOutput,
  ModelCaller,
} from "./types";
import { withModelFallback } from "./retry";
import { EMBER_MODEL_CHAIN } from "./ember/models";

// PRD §3/§15: pin the exact model identifier and confirm current free-tier
// quota (RPM/RPD/TPM) in Google AI Studio at implementation time — don't
// hardcode a number that will go stale. Verified against the live API
// (2026-08-12): "gemini-2.0-flash" is already deprecated/removed
// (404 "no longer available"). "gemini-flash-latest" and
// "gemini-flash-lite-latest" are Google's own maintained aliases to the
// current recommended Flash-tier and Flash-Lite-tier models — each is a
// distinct model with its own separate RPM/TPM/RPD quota bucket, so
// chaining them here (via withModelFallback) spreads load instead of
// pinning every call to one model's shared free-tier quota. Still
// overridable to a single pinned model via GEMINI_MODEL.
// Pinned in ember/models.ts (see the note there on why not the -latest aliases).
const DEFAULT_MODEL_CHAIN = EMBER_MODEL_CHAIN;

function resolveModelChain(modelName?: string): string[] {
  if (modelName) return [modelName];
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  return DEFAULT_MODEL_CHAIN;
}

// Our own JsonSchema stays SDK-agnostic (types.ts has zero external
// dependencies) — this is the one place that adapts it to the genai SDK's
// stricter Schema shape. Tool authors (apps/web/lib/ember) are responsible
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
export function createGeminiModelCaller(apiKey: string, modelName?: string): ModelCaller {
  const client = new GoogleGenAI({ apiKey });
  const models = resolveModelChain(modelName);

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

    const response = await withModelFallback(models, (model) =>
      client.models.generateContent({
        model,
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

    const usage = response.usageMetadata
      ? {
          inputTokens: response.usageMetadata.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined;

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      return {
        type: "function_calls",
        usage,
        calls: functionCalls.map((call) => ({
          name: call.name ?? "",
          args: (call.args ?? {}) as Record<string, unknown>,
        })),
      };
    }

    return { type: "text", text: response.text ?? "", usage };
  };
}
