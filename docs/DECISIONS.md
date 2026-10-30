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
