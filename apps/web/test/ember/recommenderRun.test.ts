import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recommend } from "@perq/scoring-engine";
import { catalogFileSchema } from "@perq/shared";
import { FIXTURES } from "../../eval/fixtures";
import { recommenderFallback } from "@/lib/ember/recommender/fallback";
import { labelsForEvent, WRITING_LABEL } from "@/lib/ember/recommender/narration";
import { cardMentioned, chatFallback, explainRecommendation } from "@/lib/ember/recommender/run";
import { bucketForRupees, createRecommenderTools, findCard } from "@/lib/ember/recommender/tools";
import { ungroundedRupees } from "@perq/ai";

const catalogue = catalogFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, "../../../../packages/db/data/cards.json"), "utf-8"))
);
const answers = FIXTURES[1]!.answers;
const result = recommend(answers, catalogue);
const input = { userId: null, answers, result, catalogue, heldCardIds: [], callModel: null };

describe("Ember recommender (no Gemini)", () => {
  it("falls back to a template built only from the engine's numbers, with narration", async () => {
    const labels: string[] = [];
    const answer = await explainRecommendation({ ...input, onLabel: (l) => void labels.push(l) });
    expect(answer.source).toBe("fallback_template");
    expect(answer.text).toContain(result.ranked[0]!.name);
    expect(ungroundedRupees(answer.text, [result])).toEqual([]);
    expect(labels.at(-1)).toBe(WRITING_LABEL);
    expect(labels).toHaveLength(4);
  });

  it("template mentions the fee waiver when the user's spend clears it", () => {
    expect(recommenderFallback(result)).toMatch(/fee is waived|no annual fee|yearly fee/);
  });

  it("chat fallback answers 'why not X?' with both cards' real numbers", () => {
    const text = chatFallback("why not the Swiggy HDFC card?", input);
    const swiggy = result.ranked.find((c) => c.cardId === "hdfc-swiggy")!;
    expect(text).toContain("Swiggy HDFC");
    expect(ungroundedRupees(text, [result])).toEqual([]);
    expect(text).toContain(swiggy.name);
  });

  it("finds cards by id, loose id or name", () => {
    expect(findCard(catalogue, "hdfc_swiggy")?.id).toBe("hdfc-swiggy");
    expect(findCard(catalogue, "Swiggy HDFC")?.id).toBe("hdfc-swiggy");
    expect(findCard(catalogue, "amazon pay")?.id).toBe("icici-amazon-pay");
    expect(cardMentioned("what about the amazon pay one", catalogue)?.id).toBe("icici-amazon-pay");
  });

  it("maps what-if rupees to the nearest quiz bucket", () => {
    expect([0, 500, 2000, 5000, 9000].map(bucketForRupees)).toEqual(["0", "lt_1k", "1k_3k", "3k_6k", "6k_plus"]);
  });

  it("whatIf re-scores without saving and reports the change", async () => {
    const whatIf = createRecommenderTools(input).find((t) => t.name === "whatIf")!;
    const out = (await whatIf.handler({ monthlySpend: { dining: 9000 } }, { userId: null, task: "chat", runId: "r" })) as {
      saved: boolean;
      assumedMonthlySpend: Record<string, number>;
    };
    expect(out.saved).toBe(false);
    expect(out.assumedMonthlySpend.dining).toBe(8000);
  });

  it("narrates scoreCards as two steps", () => {
    const labels = labelsForEvent({
      type: "tool",
      output: {},
      step: { tool: "scoreCards", input: {}, outputSummary: "", ms: 1, status: "ok", narration: "Filtered 40 cards to the 12 you can get" },
    });
    expect(labels).toEqual(["Filtered 40 cards to the 12 you can get", "Worked out your yearly value for each"]);
  });
});
