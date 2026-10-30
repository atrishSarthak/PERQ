# Decisions log (Step 0 + Step 1)

Judgement calls made while working through `docs/PERQ_Handoff_Step0_Step1.md`. Newest at the bottom.

1. **File name.** The session prompt said `docs/DISIONS.md`; the handoff says `docs/DECISIONS.md`.
   I used `DECISIONS.md` and read the prompt's spelling as a typo.
2. **Spec location.** The handoff was at the repo root; moved to `docs/PERQ_Handoff_Step0_Step1.md`.
3. **Uncommitted work at start.** The working tree had uncommitted Feature 3 edits and a useful
   `packages/ai` model-fallback chain (flash → flash-lite on 429). I committed the code as-is in one
   snapshot commit before checkpoint 1, so checkpoint commits only hold checkpoint work. Untracked root
   planning docs (`PERQ_*_Plan.md`, `PERQ_Feature3_PRD.md`) and PNGs were left untracked and untouched.
4. **D15 live web-searched card terms are retired.** They contradict the locked rule that card
   terms come from the bank's own pages and are verified. Ranking uses only the curated, verified
   catalogue. The D15 code stays in place, unlinked, and is listed in AUDIT.md as "to delete later".
5. **Checkpoint 2 was additive.** The repo was already a Turborepo, so no existing files moved. Added
   `.npmrc` (`node-linker=hoisted`), scaffolds for `packages/finance-engine` and `packages/shared`, root
   scripts, and `packages/config/tsconfig.react-native.json`. No eslint/prettier configs were added:
   the repo has none today and the handoff doesn't depend on them.
6. **Root db scripts use `pnpm --filter`, not turbo**, so arguments pass through. `db:seed-cards` now
   defaults to `packages/db/data/cards.json`.
7. **Expo SDK 58** (current stable, 2026-09-29) for `apps/mobile`. Expo Go on the App Store tracks the
   newest SDK; RUNNING.md tells you to confirm the SDK shown in Expo Go.
8. **Rename scope.** MIMIR → Ember in all tracked code, tests, prompts, UI copy, README/TODOS, the
   tracked planning PRDs and the design-reference mockup. Not touched: applied drizzle migrations and
   snapshots (history; migration `0005_ember_agent_default` changes both `agent` defaults and backfills
   existing rows), `docs/AUDIT.md` and the handoff spec, and your **untracked** root drafts
   (`PERQ_*_Plan.md`, `PERQ_Feature3_PRD.md`, `MIMIR_Avtar.png`), which I won't edit unasked.
   `git grep -i mimir` outside those paths returns nothing.
9. **Narration labels** follow the handoff copy: "Ember is checking your profile", "Ember compared
   N cards", "Ember is writing your recommendation".
10. **Goal advisor unlinked.** The home dashboard's Goal widget became a "Card Manager arrives next"
    placeholder. The `/goal` routes still exist but nothing links to them.
11. **Token pipeline.** `packages/design-tokens/src/tokens.ts` is the only place colour values live.
    `tokens.css` is generated from it (`pnpm --filter @perq/design-tokens build:css`), and a test fails
    if the two drift. The test also checks WCAG AA for every text/background pair in both themes.
12. **Extra derived tokens** (not in the handoff table, all AA-checked): `navy750 #222452` (nested surface
    on dark, since navy-700 is reserved for borders), `ice100 #E9EEF2` and `lightBorder #D3DCE2` (light
    theme surfaces/borders), `warning #E59A3B` (kept from the old semantic set), and a darker success,
    warning and danger for the light theme so ₹ figures stay readable.
13. **Old `--accent`/`--gold` vars replaced** with `--primary` (button fills), `--link` (link text, focus
    rings) and `--ember` / `--on-ember` (Ember accent: chartreuse on dark, electric on light). User chat
    bubbles moved from gold to electric, because chartreuse is never a large background.
14. **Web theme default is dark** regardless of OS setting; light applies only when picked with the toggle.
15. **New Ember avatar** is an SVG (`public/ember-avatar.svg`, a chartreuse ember mark on navy) and
    replaces the old MIMIR PNG.
16. **Pinned model: `gemini-3.5-flash`**, with `gemini-3.5-flash-lite` on 429. On 2026-10-31,
    `gemini-flash-latest` (the old default) resolved to `gemini-3.8-flash` and took 40–134 s for a
    one-word reply on our key; `gemini-3.5-flash` took ~2 s. The pin is in `packages/ai/src/ember/models.ts`,
    and `GEMINI_MODEL` overrides it. I couldn't read free-tier RPM/RPD limits from the API, so check AI
    Studio's rate-limit page before the demo.
17. **`runEmber` sits beside `runGeminiAgent`.** It's a new runner in `packages/ai/src/ember/` (zod tool
    inputs, permission levels, narration templates, banned-phrase regeneration, fallback, run logging).
    `runGeminiAgent` stays only for the retired Feature 3 code; Feature 1 moves to `runEmber` at
    checkpoint 12.
18. **Permission refusal still shows the tool to the model.** Registered tools above `maxPermission`
    are declared to the model, but the runner refuses their calls in code and returns a
    "Permission denied" result. The model learns the limit, and the refusal is testable.
19. **Banned phrases:** on a hit, Ember gets one regeneration with explicit instructions. If that still
    fails, the template fallback is used (`status = banned_phrase_fallback`).
20. **`agent_runs` logging is injected** (`logRun`), so `packages/ai` stays free of DB code and testable.
    `user_id` is nullable for the public finder.
