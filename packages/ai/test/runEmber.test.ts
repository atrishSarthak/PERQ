import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createToolRegistry,
  EMBER_MAX_ROUNDS,
  findBannedPhrases,
  PERMISSION,
  runEmber,
  zodToToolSchema,
  type AgentRunRecord,
  type AnyEmberTool,
  type EmberStepEvent,
} from "../src/ember";
import type { ModelCaller, ModelCallOutput } from "../src/types";

function scripted(...outputs: (ModelCallOutput | Error)[]): ModelCaller {
  const fn = vi.fn();
  for (const o of outputs) {
    if (o instanceof Error) fn.mockRejectedValueOnce(o);
    else fn.mockResolvedValueOnce(o);
  }
  return fn as unknown as ModelCaller;
}

const scoreCards: AnyEmberTool = {
  name: "scoreCards",
  description: "Ranks cards",
  input: z.object({}),
  permission: PERMISSION.OBSERVE,
  narration: "Ember compared {count} cards",
  handler: async () => ({ count: 40, top: "Card A", value: 4200 }),
};

const getCardDetails: AnyEmberTool = {
  name: "getCardDetails",
  description: "One card",
  input: z.object({ cardId: z.string().describe("Card id") }),
  permission: PERMISSION.OBSERVE,
  handler: async ({ cardId }: { cardId: string }) => ({ cardId, fee: 500 }),
};

const applyForCard: AnyEmberTool = {
  name: "applyForCard",
  description: "Submits an application",
  input: z.object({ cardId: z.string() }),
  permission: PERMISSION.EXECUTE,
  handler: vi.fn(async () => ({ submitted: true })),
};

const base = {
  userId: "user-1",
  task: "recommendation",
  systemPrompt: "You are Ember.",
  messages: [{ role: "user" as const, content: "Explain my top card." }],
  maxPermission: 1 as const,
};

describe("runEmber", () => {
  it("runs tools, narrates from tool output, and returns the final text", async () => {
    const events: EmberStepEvent[] = [];
    const result = await runEmber({
      ...base,
      tools: [scoreCards],
      callModel: scripted(
        { type: "function_calls", calls: [{ name: "scoreCards", args: {} }] },
        { type: "text", text: "Card A earns you ₹4,200 a year." }
      ),
      onStep: (e) => events.push(e),
    });

    expect(result.text).toBe("Card A earns you ₹4,200 a year.");
    expect(result.status).toBe("ok");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ tool: "scoreCards", status: "ok", narration: "Ember compared 40 cards" });
    expect(result.outputs.scoreCards).toEqual({ count: 40, top: "Card A", value: 4200 });
    expect(events.map((e) => e.type)).toEqual(["tool", "writing"]);
    expect(result.runId).toMatch(/[0-9a-f-]{36}/);
  });

  it("refuses a tool above maxPermission in code and tells the model", async () => {
    const callModel = scripted(
      { type: "function_calls", calls: [{ name: "applyForCard", args: { cardId: "a" } }] },
      { type: "text", text: "I can't apply for you, but here is how." }
    );
    const result = await runEmber({ ...base, tools: [applyForCard], callModel });

    expect(applyForCard.handler).not.toHaveBeenCalled();
    expect(result.steps[0]!.status).toBe("refused");
    const secondCall = (callModel as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(JSON.stringify(secondCall.toolResults)).toContain("Permission denied");
  });

  it("refuses to register a level-5 tool", () => {
    const never: AnyEmberTool = { ...applyForCard, name: "moveMoney", permission: PERMISSION.NEVER };
    expect(() => createToolRegistry([never])).toThrow(/level 5/);
  });

  it("validates tool input with zod before calling the handler", async () => {
    const handler = vi.fn(async () => ({}));
    const tool: AnyEmberTool = { ...getCardDetails, handler };
    const result = await runEmber({
      ...base,
      tools: [tool],
      callModel: scripted(
        { type: "function_calls", calls: [{ name: "getCardDetails", args: { cardId: 42 } }] },
        { type: "text", text: "ok" }
      ),
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.steps[0]!.status).toBe("invalid_input");
  });

  it("reports an unknown tool back to the model instead of crashing", async () => {
    const result = await runEmber({
      ...base,
      tools: [scoreCards],
      callModel: scripted(
        { type: "function_calls", calls: [{ name: "doesNotExist", args: {} }] },
        { type: "text", text: "fine" }
      ),
    });
    expect(result.steps[0]!.status).toBe("unknown_tool");
    expect(result.text).toBe("fine");
  });

  it("uses the fallback template when the model call throws", async () => {
    const result = await runEmber({
      ...base,
      tools: [scoreCards],
      callModel: scripted(
        { type: "function_calls", calls: [{ name: "scoreCards", args: {} }] },
        new Error("503 UNAVAILABLE")
      ),
      fallback: (outputs) => `Template: ${(outputs.scoreCards as { top: string }).top}`,
    });
    expect(result.status).toBe("fallback");
    expect(result.text).toBe("Template: Card A");
  });

  it("throws when the model fails and no fallback is given", async () => {
    await expect(
      runEmber({ ...base, tools: [], callModel: scripted(new Error("boom")) })
    ).rejects.toThrow(/no fallback/);
  });

  it(`caps tool rounds at ${EMBER_MAX_ROUNDS} and falls back`, async () => {
    const loop: ModelCaller = vi.fn(async () => ({
      type: "function_calls" as const,
      calls: [{ name: "scoreCards", args: {} }],
    }));
    const result = await runEmber({ ...base, tools: [scoreCards], callModel: loop, fallback: () => "capped" });
    expect(loop).toHaveBeenCalledTimes(EMBER_MAX_ROUNDS);
    expect(result.status).toBe("capped");
    expect(result.text).toBe("capped");
  });

  it("regenerates once on a banned phrase, then accepts a clean reply", async () => {
    const callModel = scripted(
      { type: "text", text: "Hurry, this is a limited time offer!" },
      { type: "text", text: "This card suits your spending." }
    );
    const result = await runEmber({ ...base, tools: [], callModel });
    expect(result.text).toBe("This card suits your spending.");
    const retry = (callModel as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(retry.history.at(-1).content).toMatch(/hurry/);
  });

  it("falls back when the regenerated reply still has a banned phrase", async () => {
    const result = await runEmber({
      ...base,
      tools: [],
      callModel: scripted(
        { type: "text", text: "Guaranteed savings!" },
        { type: "text", text: "Still guaranteed." }
      ),
      fallback: () => "clean template",
    });
    expect(result.status).toBe("banned_phrase_fallback");
    expect(result.text).toBe("clean template");
  });

  it("logs the run with steps, model and summed token usage", async () => {
    const logRun = vi.fn(async (_r: AgentRunRecord) => {});
    await runEmber({
      ...base,
      tools: [scoreCards],
      callModel: scripted(
        { type: "function_calls", calls: [{ name: "scoreCards", args: {} }], usage: { inputTokens: 100, outputTokens: 5 } },
        { type: "text", text: "done", usage: { inputTokens: 150, outputTokens: 20 } }
      ),
      logRun,
    });
    const record = logRun.mock.calls[0]![0];
    expect(record).toMatchObject({ userId: "user-1", task: "recommendation", status: "ok", inputTokens: 250, outputTokens: 25 });
    expect(record.steps[0]!.tool).toBe("scoreCards");
    expect(typeof record.steps[0]!.ms).toBe("number");
  });

  it("never lets a logging failure break the run", async () => {
    const result = await runEmber({
      ...base,
      tools: [],
      callModel: scripted({ type: "text", text: "hi" }),
      logRun: async () => {
        throw new Error("db down");
      },
    });
    expect(result.text).toBe("hi");
  });
});

describe("zodToToolSchema", () => {
  it("converts objects, enums, arrays, optionals and descriptions", () => {
    const schema = zodToToolSchema(
      z.object({
        cardId: z.string().describe("Card id"),
        spend: z.number().int().optional(),
        category: z.enum(["dining", "fuel"]),
        tags: z.array(z.string()),
      })
    );
    expect(schema).toEqual({
      type: "object",
      properties: {
        cardId: { type: "string", description: "Card id" },
        spend: { type: "integer" },
        category: { type: "string", enum: ["dining", "fuel"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["cardId", "category", "tags"],
    });
  });
});

describe("findBannedPhrases", () => {
  it("catches urgency and hype words case-insensitively, including curly quotes", () => {
    expect(findBannedPhrases("Don’t miss out — ACT NOW")).toEqual(
      expect.arrayContaining(["don't miss out", "act now"])
    );
    expect(findBannedPhrases("This card is guaranteed to pay off")).toContain("guaranteed");
  });
  it("does not flag ordinary words that contain a banned word", () => {
    expect(findBannedPhrases("Your rewards are well balanced and unhurried.")).toEqual([]);
  });
});
