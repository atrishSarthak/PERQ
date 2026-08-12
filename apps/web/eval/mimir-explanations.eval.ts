import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { scoreCards } from "@perq/scoring-engine";
import { runGeminiAgent, createGeminiModelCaller, type ToolDefinition } from "@perq/ai";
import { FIXTURES } from "./fixtures";
import { EXPLANATION_SYSTEM_PROMPT } from "../lib/mimir/prompt";

// PRD's own compliance bar (§13): no urgency/scarcity language anywhere,
// ever — checked directly against real model output here, not assumed.
const BANNED_PHRASES = [
  "limited time",
  "act now",
  "hurry",
  "don't miss out",
  "spots left",
  "expires soon",
  "only today",
];

interface EvalResult {
  fixture: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
  explanation: string;
}

async function runFixture(fixture: (typeof FIXTURES)[number]): Promise<EvalResult> {
  const scored = scoreCards(fixture.profile, fixture.cards);
  const eligible = scored.filter((s) => s.eligible);
  const top = eligible[0];

  const checks: EvalResult["checks"] = [];

  checks.push({
    name: "deterministic ranking matches fixture expectation",
    passed: top?.card.id === fixture.expectedTopCardId,
    detail: `expected ${fixture.expectedTopCardId}, got ${top?.card.id}`,
  });

  if (!top) {
    return { fixture: fixture.name, passed: false, checks, explanation: "" };
  }

  const cardsById = new Map(fixture.cards.map((c) => [c.id, c]));
  const cardName = (id: string) => cardsById.get(id)?.name ?? id;

  const tools: ToolDefinition[] = [
    {
      name: "getUserProfile",
      description: "Returns the user's derived spend profile.",
      parameters: { type: "object", properties: {} },
      execute: async () => fixture.profile,
    },
    {
      name: "scoreCards",
      description: "Returns the top-ranked cards, already scored.",
      parameters: { type: "object", properties: {} },
      execute: async () =>
        eligible.map((s) => ({
          cardId: s.card.id,
          name: cardName(s.card.id),
          score: Math.round(s.score),
          annualFee: s.card.annualFee,
          topCategories: [...s.breakdown]
            .sort((a, b) => b.annualValue - a.annualValue)
            .slice(0, 3)
            .map((b) => ({
              category: b.category,
              monthlySpend: b.monthlySpend,
              annualValue: Math.round(b.annualValue),
            })),
          milestoneValue: Math.round(s.milestoneValue),
        })),
    },
    {
      name: "getCardDetails",
      description: "Returns full details for one card by id.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "string" } },
        required: ["cardId"],
      },
      execute: async (args: unknown) => {
        const cardId = (args as { cardId?: string })?.cardId;
        const card = cardId ? cardsById.get(cardId) : undefined;
        return card ?? { error: "not found" };
      },
    },
  ];

  const result = await runGeminiAgent({
    systemPrompt: EXPLANATION_SYSTEM_PROMPT,
    history: [
      { role: "user", content: "Write MIMIR's explanation for this user's #1 recommended card now." },
    ],
    tools,
    callModel: createGeminiModelCaller(requireGeminiKey()),
  });

  const explanation = result.finalText ?? "";

  checks.push({
    name: "did not hit the tool-call round cap",
    passed: !result.cappedOut,
  });

  checks.push({
    name: "explanation names the correct top card",
    passed: explanation.toLowerCase().includes(cardName(top.card.id).toLowerCase()),
  });

  checks.push({
    name: `explanation grounds a real number (${fixture.expectedGroundedNumber})`,
    passed: explanation.includes(fixture.expectedGroundedNumber),
  });

  const lowerExplanation = explanation.toLowerCase();
  const foundBanned = BANNED_PHRASES.filter((p) => lowerExplanation.includes(p));
  checks.push({
    name: "no urgency/scarcity language (PRD §13)",
    passed: foundBanned.length === 0,
    detail: foundBanned.join(", "),
  });

  if (fixture.expectedTradeoffMention) {
    checks.push({
      name: `surfaces the non-obvious trade-off (mentions "${fixture.expectedTradeoffMention}")`,
      passed: lowerExplanation.includes(fixture.expectedTradeoffMention),
    });
  }

  return {
    fixture: fixture.name,
    passed: checks.every((c) => c.passed),
    checks,
    explanation,
  };
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

async function main() {
  console.log(`Running MIMIR explanation eval suite (${FIXTURES.length} fixtures)...\n`);
  const results: EvalResult[] = [];

  for (const fixture of FIXTURES) {
    process.stdout.write(`  ${fixture.name}... `);
    const result = await runFixture(fixture);
    results.push(result);
    console.log(result.passed ? "PASS" : "FAIL");
    for (const check of result.checks) {
      if (!check.passed) {
        console.log(`    ✗ ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
      }
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n${passedCount}/${results.length} fixtures passed.`);

  if (passedCount < results.length) {
    console.log("\nFull explanations for failed fixtures:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`\n[${r.fixture}]\n${r.explanation}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(1);
});
