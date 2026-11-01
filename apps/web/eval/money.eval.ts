import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { findBannedPhrases, ungroundedRupees } from "@perq/ai";
import { validateNudgeCopy } from "@perq/finance-engine";
import { chatTurn } from "../lib/ember/money/run";
import { geminiCaller } from "../lib/ember/recommender/run";
import { writeNudgeCopy } from "../lib/money/nudgeCopy";
import { candidates, CHAT_FIXTURES, COPY_RULES, moneyEvalContext } from "./moneyFixtures";

// Money Manager eval (handoff §14), live Gemini, `pnpm eval:money`:
//   5 nudge-copy fixtures: Gemini's wording passes validateNudgeCopy (payload
//     numbers only, no urgency words, length) and wasn't the template fallback;
//   5 chat fixtures: every ₹ figure is from a tool output, no banned phrases,
//     plus a per-question check (utilisation, where the money went, refusing
//     investment advice, never claiming a payment, best card for bills).

const PAUSE_MS = 4000;
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

async function main() {
  if (!geminiCaller()) throw new Error("GEMINI_API_KEY is not set (or GEMINI_DISABLED=1)");
  const results: { name: string; ok: boolean; notes: string[]; text: string }[] = [];

  const all = candidates();
  for (const rule of COPY_RULES) {
    const c = all.find((x) => x.ruleId === rule)!;
    const copy = await writeNudgeCopy(c);
    const check = validateNudgeCopy(copy, c.payload, { title: c.templateTitle, body: c.templateBody });
    const notes = [
      ...(copy.source === "ai" ? [] : ["fell back to the template (Gemini text rejected or unavailable)"]),
      ...(check.ok ? [] : [check.reason]),
      ...findBannedPhrases(`${copy.title} ${copy.body}`).map((p) => `banned: ${p}`),
    ];
    results.push({ name: `nudge copy: ${rule}`, ok: notes.length === 0, notes, text: `${copy.title} | ${copy.body}` });
    await pause();
  }

  for (const f of CHAT_FIXTURES) {
    const a = await chatTurn({ userId: null, message: f.message, history: [], recommender: null, money: moneyEvalContext(), callModel: geminiCaller() });
    const extra = f.expect(a.text);
    const notes = [
      ...(a.source === "gemini" ? [] : ["fell back to the template"]),
      ...ungroundedRupees(a.text, a.toolOutputs).map((r) => `ungrounded ${r}`),
      ...findBannedPhrases(a.text).map((p) => `banned: ${p}`),
      ...(extra ? [extra] : []),
    ];
    results.push({ name: `chat: ${f.name}`, ok: notes.length === 0, notes, text: a.text });
    await pause();
  }

  for (const r of results) {
    console.log(`\n${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    for (const n of r.notes) console.log(`  ✗ ${n}`);
    console.log(`  ↳ ${r.text.replace(/\n/g, "\n    ")}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} money fixtures passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
