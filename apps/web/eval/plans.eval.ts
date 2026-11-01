import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Env comes from `tsx --env-file=.env`: the plan tools import the DB client, which reads it on import.
const __dirname = dirname(fileURLToPath(import.meta.url));

import { findBannedPhrases, ungroundedRupees } from "@perq/ai";
import { validatePlanExplanation } from "@perq/finance-engine";
import { VERDICT_LABELS, type PartialPlanInput } from "@perq/shared";
import { chatTurn } from "../lib/ember/money/run";
import { createPlanTools } from "../lib/ember/plans/tools";
import { geminiCaller } from "../lib/ember/recommender/run";
import { explainPlan } from "../lib/plans/explain";
import { extractFromImage } from "../lib/plans/extract";
import { EXPLAIN_FIXTURES, NO_PRICE_CTX, NO_PRICE_MESSAGE, SCREENSHOTS } from "./planFixtures";

// Purchase planner eval (Step 3 §11), live Gemini, `pnpm eval:plans`:
//   4 explanation fixtures (one per verdict): Gemini's wording passed the
//     validator (not the template), every ₹ figure is in the PlanResult, the
//     first sentence carries the engine's verdict, no item judgement or urgency;
//   1 chat fixture: a purchase question with no price gets a question back,
//     no ₹ figure, and the confirmation card marks the price missing;
//   5 screenshot fixtures (fixtures/plans/*.png, synthetic): price read exactly.

const PAUSE_MS = 4000;
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));
const FIXTURE_DIR = resolve(__dirname, "../../../fixtures/plans");

async function main() {
  const callModel = geminiCaller();
  const apiKey = process.env.GEMINI_API_KEY ?? null;
  if (!callModel || !apiKey) throw new Error("GEMINI_API_KEY is not set (or GEMINI_DISABLED=1)");
  const results: { name: string; ok: boolean; notes: string[]; text: string }[] = [];

  for (const f of EXPLAIN_FIXTURES) {
    const e = await explainPlan({ userId: "eval", input: f.input, result: f.result, callModel, logRun: async () => {}, task: "plan_eval" });
    const check = validatePlanExplanation(e.text, f.result);
    const notes = [
      ...(f.result.verdict === f.expect ? [] : [`engine verdict ${f.result.verdict}, fixture expects ${f.expect}`]),
      ...(e.source === "ai" ? [] : ["fell back to the template (Gemini text rejected or unavailable)"]),
      ...(check.ok ? [] : [check.reason]),
      ...ungroundedRupees(e.text, [f.result]).map((r) => `ungrounded ${r}`),
      ...findBannedPhrases(e.text).map((p) => `banned: ${p}`),
    ];
    results.push({ name: `explain (${VERDICT_LABELS[f.expect].replace(", on {date}", ", on a later day")}): ${f.name}`, ok: notes.length === 0, notes, text: e.text });
    await pause();
  }

  let card: { draft: PartialPlanInput; missing: string[] } | null = null;
  const planTools = createPlanTools({ userId: "eval", extract: { apiKey, userId: "eval" }, loadCtx: async () => NO_PRICE_CTX, onPlanConfirm: (draft, missing) => (card = { draft, missing }) });
  const a = await chatTurn({ userId: null, message: NO_PRICE_MESSAGE, history: [], recommender: null, money: null, planTools, callModel });
  const shown = card as { draft: PartialPlanInput; missing: string[] } | null;
  const chatNotes = [
    ...(a.source === "gemini" ? [] : ["fell back to the template"]),
    ...(shown ? [] : ["no confirmation card (extractPlanFromMessage not called)"]),
    ...(shown && !shown.missing.includes("price") ? [`card has a price: ${shown.draft.price}`] : []),
    ...(/₹\s?\d/.test(a.text) ? ["gave a ₹ figure"] : []),
    ...(/price|cost|how much/i.test(a.text) && a.text.includes("?") ? [] : ["didn't ask for the price"]),
    ...findBannedPhrases(a.text).map((p) => `banned: ${p}`),
  ];
  results.push({ name: "chat: asks for a missing price", ok: chatNotes.length === 0, notes: chatNotes, text: a.text });
  await pause();

  const expected = JSON.parse(readFileSync(resolve(FIXTURE_DIR, "expected.json"), "utf-8")) as Record<string, { price: number; item: string }>;
  for (const name of SCREENSHOTS) {
    const img = readFileSync(resolve(FIXTURE_DIR, `${name}.png`)).toString("base64");
    const out = await extractFromImage(img, "image/png", { apiKey, userId: "eval" });
    const want = expected[name]!;
    const notes = [
      ...(out.draft.price === want.price ? [] : [`price ${out.draft.price ?? "missing"}, expected ${want.price}`]),
      ...(out.missing.includes("price") ? ["marked price missing"] : []),
    ];
    results.push({ name: `screenshot: ${name}`, ok: notes.length === 0, notes, text: `${out.draft.item?.name ?? "?"} · ₹${out.draft.price ?? "?"} · ${out.draft.offers?.length ?? 0} offers` });
    await pause();
  }

  for (const r of results) {
    console.log(`\n${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    for (const n of r.notes) console.log(`  ✗ ${n}`);
    console.log(`  ↳ ${r.text.replace(/\n/g, "\n    ")}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} planner fixtures passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
