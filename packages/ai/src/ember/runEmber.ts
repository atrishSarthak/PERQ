import type { ConversationTurn, ModelCallOutput, ToolDefinition } from "../types";
import { findBannedPhrases } from "./bannedPhrases";
import { EMBER_MODEL } from "./models";
import type {
  AgentRunRecord,
  AnyEmberTool,
  EmberContext,
  RunEmberParams,
  RunEmberResult,
  RunStatus,
  Step,
  ToolOutputs,
} from "./types";
import { PERMISSION } from "./types";
import { zodToToolSchema } from "./zodToToolSchema";

// Tool-round cap (handoff §0.4: "keep the existing cap or use 6"). Six is
// enough for profile → score → two or three detail/compare lookups.
export const EMBER_MAX_ROUNDS = 6;

const SUMMARY_MAX_CHARS = 400;

function newRunId(): string {
  // globalThis.crypto exists in Node 20 and in Next's edge/node runtimes.
  return globalThis.crypto.randomUUID();
}

function summarize(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value) ?? "undefined";
  } catch {
    json = String(value);
  }
  return json.length > SUMMARY_MAX_CHARS ? `${json.slice(0, SUMMARY_MAX_CHARS)}…` : json;
}

function fillTemplate(template: string, ...sources: unknown[]): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    for (const src of sources) {
      if (src && typeof src === "object" && key in (src as Record<string, unknown>)) {
        const v = (src as Record<string, unknown>)[key];
        if (Array.isArray(v)) return String(v.length);
        if (v !== null && v !== undefined && typeof v !== "object") return String(v);
      }
    }
    return match;
  });
}

/**
 * Validates a tool list once, up front: names unique, inputs convertible to
 * a Gemini function schema, and no level-5 ("never") tool registered.
 */
export function createToolRegistry(tools: AnyEmberTool[]): AnyEmberTool[] {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (tool.permission === PERMISSION.NEVER) {
      throw new Error(`Tool "${tool.name}" has permission level 5 (never) and cannot be registered`);
    }
    if (seen.has(tool.name)) throw new Error(`Duplicate Ember tool name "${tool.name}"`);
    seen.add(tool.name);
    zodToToolSchema(tool.input as never); // throws on unsupported shapes
  }
  return tools;
}

async function executeCall(
  tools: Map<string, AnyEmberTool>,
  name: string,
  rawArgs: Record<string, unknown>,
  maxPermission: number,
  ctx: EmberContext
): Promise<{ step: Step; output: unknown }> {
  const started = Date.now();
  const finish = (status: Step["status"], output: unknown, narration: string | null = null) => ({
    step: {
      tool: name,
      input: rawArgs,
      outputSummary: summarize(output),
      ms: Date.now() - started,
      status,
      narration,
    },
    output,
  });

  const tool = tools.get(name);
  if (!tool) return finish("unknown_tool", { error: `Unknown tool: ${name}` });

  // Permission is enforced here, in code — not left to the prompt.
  if (tool.permission > maxPermission) {
    return finish("refused", {
      error: `Permission denied: "${name}" needs level ${tool.permission}, this run allows up to ${maxPermission}.`,
    });
  }

  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return finish("invalid_input", {
      error: "Invalid tool input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    });
  }

  try {
    const output = await tool.handler(parsed.data, ctx);
    const narration =
      typeof tool.narration === "function"
        ? tool.narration(parsed.data, output)
        : tool.narration
          ? fillTemplate(tool.narration, output, parsed.data)
          : null;
    return finish("ok", output, narration);
  } catch (err) {
    // One failing tool doesn't end the run: the model sees the error and
    // can adapt. The round cap still bounds the loop.
    return finish("error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Ember's general agent runner (handoff §0.4). Every feature reuses it with
 * its own tools and prompt. Gemini picks and sequences tools and writes the
 * prose; tool handlers (pure code) produce every number.
 */
export async function runEmber(params: RunEmberParams): Promise<RunEmberResult> {
  const runId = params.runId ?? newRunId();
  const maxRounds = params.maxRounds ?? EMBER_MAX_ROUNDS;
  const tools = createToolRegistry(params.tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const ctx: EmberContext = { userId: params.userId, task: params.task, runId };

  const declarations: Pick<ToolDefinition, "name" | "description" | "parameters">[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToToolSchema(t.input as never),
  }));

  const steps: Step[] = [];
  const outputs: ToolOutputs = {};
  const toolResults: { name: string; result: unknown }[] = [];
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let history: ConversationTurn[] = [...params.messages];
  let bannedRetryUsed = false;

  const addUsage = (out: ModelCallOutput) => {
    if (!out.usage) return;
    inputTokens = (inputTokens ?? 0) + (out.usage.inputTokens ?? 0);
    outputTokens = (outputTokens ?? 0) + (out.usage.outputTokens ?? 0);
  };

  const finish = async (
    text: string,
    status: RunStatus,
    error: string | null = null
  ): Promise<RunEmberResult> => {
    const record: AgentRunRecord = {
      id: runId,
      userId: params.userId,
      task: params.task,
      steps,
      model: params.model ?? EMBER_MODEL,
      inputTokens,
      outputTokens,
      status,
      error,
    };
    try {
      await params.logRun?.(record);
    } catch (logErr) {
      console.error("[runEmber] logRun failed:", logErr);
    }
    return { text, steps, runId, status, outputs };
  };

  const fallBack = async (status: RunStatus, reason: string) => {
    params.onStep?.({ type: "fallback", reason });
    if (!params.fallback) {
      await finish("", status, reason);
      throw new Error(`Ember run failed (${reason}) and no fallback was provided`);
    }
    return finish(params.fallback(outputs), status, reason);
  };

  for (let round = 0; round < maxRounds; round++) {
    let output: ModelCallOutput;
    try {
      output = await params.callModel({
        systemPrompt: params.systemPrompt,
        history,
        toolDeclarations: declarations,
        toolResults,
      });
    } catch (err) {
      return fallBack("fallback", err instanceof Error ? err.message : String(err));
    }
    addUsage(output);

    if (output.type === "text") {
      const banned = findBannedPhrases(output.text);
      if (banned.length === 0 && output.text.trim()) {
        params.onStep?.({ type: "writing" });
        return finish(output.text.trim(), "ok");
      }
      if (banned.length > 0 && !bannedRetryUsed) {
        // One regeneration with an explicit instruction, then template.
        bannedRetryUsed = true;
        history = [
          ...history,
          { role: "assistant", content: output.text },
          {
            role: "user",
            content: `Rewrite that reply without these words or phrases: ${banned.join(", ")}. No urgency, scarcity or hype. Keep every number exactly as the tools gave it.`,
          },
        ];
        continue;
      }
      return fallBack(
        banned.length > 0 ? "banned_phrase_fallback" : "fallback",
        banned.length > 0 ? `banned phrases: ${banned.join(", ")}` : "empty reply"
      );
    }

    for (const call of output.calls) {
      const { step, output: result } = await executeCall(
        toolsByName,
        call.name,
        call.args,
        params.maxPermission,
        ctx
      );
      steps.push(step);
      toolResults.push({ name: call.name, result });
      if (step.status === "ok") outputs[call.name] = result;
      params.onStep?.({ type: "tool", step, output: result });
    }
  }

  return fallBack("capped", `exceeded ${maxRounds} tool rounds`);
}
