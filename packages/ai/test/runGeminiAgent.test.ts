import { describe, expect, it, vi } from "vitest";
import { MAX_TOOL_ROUNDS, runGeminiAgent } from "../src/runGeminiAgent";
import type { ModelCaller, ToolDefinition } from "../src/types";

function makeTool(name: string, execute: ToolDefinition["execute"]): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    parameters: { type: "object", properties: {} },
    execute,
  };
}

describe("runGeminiAgent", () => {
  it("returns final text immediately when the model calls no tools", async () => {
    const callModel: ModelCaller = vi.fn().mockResolvedValue({
      type: "text",
      text: "MIMIR recommends the Axis Airtel card.",
    });

    const result = await runGeminiAgent({
      systemPrompt: "You are MIMIR.",
      history: [],
      tools: [],
      callModel,
    });

    expect(result.finalText).toBe("MIMIR recommends the Axis Airtel card.");
    expect(result.roundsUsed).toBe(1);
    expect(result.cappedOut).toBe(false);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("executes a single tool call then returns final text on the next round", async () => {
    const getProfile = vi.fn().mockResolvedValue({ income: 500000 });
    const tools = [makeTool("getUserProfile", getProfile)];

    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [{ name: "getUserProfile", args: {} }],
      })
      .mockResolvedValueOnce({ type: "text", text: "done" });

    const result = await runGeminiAgent({
      systemPrompt: "You are MIMIR.",
      history: [],
      tools,
      callModel,
    });

    expect(getProfile).toHaveBeenCalledOnce();
    expect(result.finalText).toBe("done");
    expect(result.roundsUsed).toBe(2);
  });

  it("executes multiple tool calls requested in a single turn together, one follow-up round", async () => {
    const getA = vi.fn().mockResolvedValue("a-result");
    const getB = vi.fn().mockResolvedValue("b-result");
    const tools = [makeTool("toolA", getA), makeTool("toolB", getB)];

    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [
          { name: "toolA", args: {} },
          { name: "toolB", args: {} },
        ],
      })
      .mockResolvedValueOnce({ type: "text", text: "done" });

    const result = await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
    });

    expect(getA).toHaveBeenCalledOnce();
    expect(getB).toHaveBeenCalledOnce();
    // Both calls happen before the next callModel invocation — round 2, not 3.
    expect(result.roundsUsed).toBe(2);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("records a tool throw as an error result and keeps the loop alive", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("card lookup failed"));
    const tools = [makeTool("getCardDetails", failing)];

    const secondCallArgs: unknown[] = [];
    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [{ name: "getCardDetails", args: { cardId: "x" } }],
      })
      .mockImplementationOnce(async (input) => {
        secondCallArgs.push(input.toolResults);
        return { type: "text", text: "handled the error" };
      });

    const result = await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
    });

    expect(result.finalText).toBe("handled the error");
    expect(secondCallArgs[0]).toEqual([
      { name: "getCardDetails", result: { error: "card lookup failed" } },
    ]);
  });

  it("returns an error result for an unknown tool name without throwing", async () => {
    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [{ name: "nonexistentTool", args: {} }],
      })
      .mockResolvedValueOnce({ type: "text", text: "recovered" });

    const result = await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools: [],
      callModel,
    });

    expect(result.finalText).toBe("recovered");
  });

  it("stops and reports cappedOut when maxRounds is exceeded without final text", async () => {
    const echo = vi.fn().mockResolvedValue("ok");
    const tools = [makeTool("loopTool", echo)];

    const callModel: ModelCaller = vi.fn().mockResolvedValue({
      type: "function_calls",
      calls: [{ name: "loopTool", args: {} }],
    });

    const result = await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
      maxRounds: 3,
    });

    expect(result.cappedOut).toBe(true);
    expect(result.finalText).toBeNull();
    expect(result.roundsUsed).toBe(3);
    expect(callModel).toHaveBeenCalledTimes(3);
  });

  it("defaults maxRounds to MAX_TOOL_ROUNDS (10) when not specified", async () => {
    const echo = vi.fn().mockResolvedValue("ok");
    const tools = [makeTool("loopTool", echo)];
    const callModel: ModelCaller = vi.fn().mockResolvedValue({
      type: "function_calls",
      calls: [{ name: "loopTool", args: {} }],
    });

    const result = await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
    });

    expect(MAX_TOOL_ROUNDS).toBe(10);
    expect(result.roundsUsed).toBe(10);
  });

  it("fires onStep events for tool_call, tool_result, and final", async () => {
    const echo = vi.fn().mockResolvedValue("ok");
    const tools = [makeTool("aTool", echo)];
    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [{ name: "aTool", args: {} }],
      })
      .mockResolvedValueOnce({ type: "text", text: "done" });

    const events: string[] = [];
    await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
      onStep: (e) => events.push(e.type),
    });

    expect(events).toEqual(["tool_call", "tool_result", "final"]);
  });

  it("includes the tool call's args and result on step events for narration enrichment", async () => {
    const getCardDetails = vi.fn().mockResolvedValue({ name: "Axis Airtel" });
    const tools = [makeTool("getCardDetails", getCardDetails)];
    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce({
        type: "function_calls",
        calls: [{ name: "getCardDetails", args: { cardId: "axis-airtel" } }],
      })
      .mockResolvedValueOnce({ type: "text", text: "done" });

    const events: Array<Record<string, unknown>> = [];
    await runGeminiAgent({
      systemPrompt: "sys",
      history: [],
      tools,
      callModel,
      onStep: (e) => events.push(e as unknown as Record<string, unknown>),
    });

    expect(events[0]).toMatchObject({
      type: "tool_call",
      toolName: "getCardDetails",
      args: { cardId: "axis-airtel" },
    });
    expect(events[1]).toMatchObject({
      type: "tool_result",
      toolName: "getCardDetails",
      result: { name: "Axis Airtel" },
    });
  });
});
