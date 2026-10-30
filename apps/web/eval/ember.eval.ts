import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { findBannedPhrases, ungroundedRupees } from "@perq/ai";
import { recommend } from "@perq/scoring-engine";
import { catalogFileSchema } from "@perq/shared";
import { chatWithEmber, explainRecommendation, geminiCaller } from "../lib/ember/recommender/run";
import { FIXTURES, type EvalFixture } from "./fixtures";

// Ember eval (handoff §1.8), run live against Gemini with `pnpm eval`:
//   - every ₹ number in Ember's text appears in a tool output
//   - no banned (urgency/hype) phrases
//   - the explanation names the real rank-1 card
//   - "why not X?" answers name the real card X
// A fixture where Ember fell back to the template fails: the point is to
// test the model's own writing.

const catalogue = catalogFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, "../../../packages/db/data/cards.json"), "utf-8"))
);
const PAUSE_MS = 4000; // stay under the free tier's requests-per-minute limit

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

/** Card names are long; accept the distinctive part ("Live+", "Swiggy HDFC", "Amazon Pay ICICI"). */
function mentionsCard(text: string, cardId: string): boolean {
  const card = catalogue.find((c) => c.id === cardId)!;
  const t = text.toLowerCase();
  if (t.includes(card.name.toLowerCase())) return true;
  const words = card.name
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length > 2 && !["card", "credit", "bank", "the"].includes(w));
  return words.filter((w) => t.includes(w)).length >= Math.min(2, words.length);
}

async function runFixture(f: EvalFixture): Promise<{ checks: Check[]; text: string }> {
  const callModel = geminiCaller();
  if (!callModel) throw new Error("GEMINI_API_KEY is not set (or GEMINI_DISABLED=1)");
  const result = recommend(f.answers, catalogue);
  const top = result.ranked[0]!;
  const input = {
    userId: null,
    answers: f.answers,
    result,
    catalogue,
    heldCardIds: f.answers.cardsHeld,
    callModel,
  };

  const answer = f.whyNotCardId
    ? await chatWithEmber({
        ...input,
        message: `Why not the ${catalogue.find((c) => c.id === f.whyNotCardId)!.name}?`,
        history: [],
      })
    : await explainRecommendation(input);

  const misses = ungroundedRupees(answer.text, answer.toolOutputs);
  const banned = findBannedPhrases(answer.text);
  const checks: Check[] = [
    { name: "deterministic Top Pick matches fixture", passed: top.cardId === f.expectedTopCardId, detail: top.cardId },
    { name: "model answered (no template fallback)", passed: answer.source === "gemini", detail: answer.source },
    { name: "every ₹ figure is in a tool output", passed: misses.length === 0, detail: misses.join(", ") },
    { name: "no banned phrases", passed: banned.length === 0, detail: banned.join(", ") },
    f.whyNotCardId
      ? { name: `names the asked-about card (${f.whyNotCardId})`, passed: mentionsCard(answer.text, f.whyNotCardId) }
      : { name: `names the rank-1 card (${top.cardId})`, passed: mentionsCard(answer.text, top.cardId) },
  ];
  return { checks, text: answer.text };
}

async function main() {
  let failed = 0;
  for (const [i, f] of FIXTURES.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
    try {
      const { checks, text } = await runFixture(f);
      const ok = checks.every((c) => c.passed);
      if (!ok) failed++;
      console.log(`\n${ok ? "PASS" : "FAIL"}  ${f.name}`);
      for (const c of checks) console.log(`  ${c.passed ? "✓" : "✗"} ${c.name}${c.detail && !c.passed ? ` (${c.detail})` : ""}`);
      console.log(`  ↳ ${text.replace(/\n/g, "\n    ")}`);
    } catch (err) {
      failed++;
      console.log(`\nFAIL  ${f.name}\n  ✗ threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n${FIXTURES.length - failed}/${FIXTURES.length} fixtures passed`);
  process.exit(failed ? 1 : 0);
}

main();
