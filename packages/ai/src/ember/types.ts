import type { ZodType, ZodTypeDef } from "zod";
import type { ConversationTurn, ModelCaller } from "../types";

// Permission levels (handoff §0.4). Every feature's tools declare one; the
// runner refuses any call above the run's maxPermission. Level 5 ("never")
// exists so the scale is explicit, but a level-5 tool can't be registered.
export const PERMISSION = {
  OBSERVE: 1,
  NOTIFY: 2,
  PREPARE: 3,
  EXECUTE: 4,
  NEVER: 5,
} as const;
export type PermissionLevel = 1 | 2 | 3 | 4 | 5;

export interface EmberContext {
  userId: string | null; // null for anonymous runs (public card finder)
  task: string;
  runId: string;
}

export interface EmberTool<I = unknown, O = unknown> {
  name: string;
  description: string; // what the model sees
  input: ZodType<I, ZodTypeDef, unknown>;
  permission: PermissionLevel;
  // Shown to the user as a narration step once the tool finishes, e.g.
  // "Ember compared {count} cards". {key} placeholders are filled from the
  // tool's output object first, then its input. A function form gets both.
  narration?: string | ((input: I, output: O) => string);
  handler: (input: I, ctx: EmberContext) => Promise<O>;
}

// Erased form for heterogeneous tool lists.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEmberTool = EmberTool<any, any>;

export type StepStatus = "ok" | "error" | "invalid_input" | "refused" | "unknown_tool";

export interface Step {
  tool: string;
  input: unknown;
  // Short JSON summary kept for agent_runs (full outputs can be large).
  outputSummary: string;
  ms: number;
  status: StepStatus;
  narration: string | null;
}

export type EmberStepEvent =
  | { type: "tool"; step: Step; output: unknown }
  | { type: "writing" }
  | { type: "fallback"; reason: string };

export type RunStatus = "ok" | "fallback" | "capped" | "banned_phrase_fallback";

export interface AgentRunRecord {
  id: string;
  userId: string | null;
  task: string;
  steps: Step[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: RunStatus;
  error: string | null;
}

export interface RunEmberParams {
  userId: string | null;
  task: string;
  systemPrompt: string;
  messages: ConversationTurn[];
  tools: AnyEmberTool[];
  maxPermission: PermissionLevel;
  callModel: ModelCaller;
  onStep?: (event: EmberStepEvent) => void;
  // Template explanation built from the tool outputs gathered so far — used
  // when Gemini fails, caps out, or keeps producing banned phrases. Without
  // one, those failures throw.
  fallback?: (outputs: ToolOutputs) => string;
  // Persists the run (apps/web writes it to agent_runs). Errors are
  // swallowed: logging must never break a user-facing run.
  logRun?: (record: AgentRunRecord) => Promise<void>;
  maxRounds?: number;
  model?: string;
  runId?: string;
}

// Tool outputs keyed by tool name (latest call wins), for fallbacks.
export type ToolOutputs = Record<string, unknown>;

export interface RunEmberResult {
  text: string;
  steps: Step[];
  runId: string;
  status: RunStatus;
  outputs: ToolOutputs;
}
