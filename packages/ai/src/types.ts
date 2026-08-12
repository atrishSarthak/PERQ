// packages/ai is Feature-1-agnostic (D5) — no getUserProfile/scoreCards
// knowledge here. Feature-specific tool implementations and prompts live in
// apps/web/lib/mimir/ (Feature 1) and, later, their own equivalents for
// Feature 2/3, all calling this same generic runner.

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute: (args: TArgs) => Promise<TResult>;
}

export type ConversationRole = "user" | "assistant";

export interface ConversationTurn {
  role: ConversationRole;
  content: string;
}

export interface ModelFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export type ModelCallOutput =
  | { type: "function_calls"; calls: ModelFunctionCall[] }
  | { type: "text"; text: string };

export interface ModelCallInput {
  systemPrompt: string;
  history: ConversationTurn[];
  toolDeclarations: Pick<ToolDefinition, "name" | "description" | "parameters">[];
  // Tool results from the most recently executed round, fed back to the
  // model as the next turn's context. Empty on the first call.
  toolResults: { name: string; result: unknown }[];
}

// The real Gemini SDK call, or a test double. Injected rather than hardcoded
// so runGeminiAgent is unit-testable with mocked responses, no API key
// required (Engineering Plan §6 test plan).
export type ModelCaller = (input: ModelCallInput) => Promise<ModelCallOutput>;

export type AgentStepEvent =
  | { type: "tool_call"; toolName: string; round: number; args: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; round: number; result: unknown }
  | { type: "final"; round: number };

export interface RunGeminiAgentParams {
  systemPrompt: string;
  history: ConversationTurn[];
  tools: ToolDefinition[];
  callModel: ModelCaller;
  onStep?: (event: AgentStepEvent) => void;
  maxRounds?: number;
}

export interface AgentResult {
  finalText: string | null;
  roundsUsed: number;
  // true when maxRounds was exceeded without the model returning final text —
  // callers (Feature 1's apps/web/lib/mimir) fall back to the D7 template
  // path on this, same as an outright model-call failure.
  cappedOut: boolean;
}
