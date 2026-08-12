import type {
  AgentResult,
  ModelFunctionCall,
  RunGeminiAgentParams,
  ToolDefinition,
} from "./types";

// D13 (revised from an initial 6): budget covers getUserProfile + scoreCards
// + up to ~3 getCardDetails calls (comparing trade-offs across top-ranked
// cards per PRD §9.1) + buffer. Exceeding this falls back to the same D7
// path as an outright model-call failure, rather than looping indefinitely —
// bounds both latency and free-tier quota burn (Perf-B/D13).
export const MAX_TOOL_ROUNDS = 10;

async function executeTool(
  tools: ToolDefinition[],
  call: ModelFunctionCall
): Promise<unknown> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return { error: `Unknown tool requested: ${call.name}` };
  }
  try {
    return await tool.execute(call.args);
  } catch (err) {
    // A single failing tool call (e.g. getCardDetails for one card) doesn't
    // abort the whole agent run — the model sees the error and can adapt or
    // proceed with what it already has. If it can't recover, the round cap
    // below still bounds the run and hands off to D7's fallback.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The generic multi-turn Gemini tool-calling loop (D5/D13/9.2): the model
 * requests a function call, the server executes it, the result is fed back,
 * repeated until the model returns final text or MAX_TOOL_ROUNDS is hit.
 * Feature-agnostic — Feature 1's specific tools (getUserProfile, scoreCards,
 * getCardDetails) and prompts are supplied by the caller, not known here.
 *
 * `callModel` is injected (not hardcoded to the Gemini SDK) so this loop is
 * unit-testable with mocked responses, no API key required.
 */
export async function runGeminiAgent(
  params: RunGeminiAgentParams
): Promise<AgentResult> {
  const { systemPrompt, history, tools, callModel, onStep } = params;
  const maxRounds = params.maxRounds ?? MAX_TOOL_ROUNDS;

  const toolDeclarations = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  const accumulatedToolResults: { name: string; result: unknown }[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const output = await callModel({
      systemPrompt,
      history,
      toolDeclarations,
      toolResults: accumulatedToolResults,
    });

    if (output.type === "text") {
      onStep?.({ type: "final", round });
      return { finalText: output.text, roundsUsed: round + 1, cappedOut: false };
    }

    // output.type === "function_calls" — execute all calls from this turn
    // together before looping again (a model can request several tools in
    // one turn; round the results back in a single follow-up, not one at a
    // time per call).
    for (const call of output.calls) {
      onStep?.({ type: "tool_call", toolName: call.name, round, args: call.args });
      const result = await executeTool(tools, call);
      accumulatedToolResults.push({ name: call.name, result });
      onStep?.({ type: "tool_result", toolName: call.name, round, result });
    }
  }

  return { finalText: null, roundsUsed: maxRounds, cappedOut: true };
}
