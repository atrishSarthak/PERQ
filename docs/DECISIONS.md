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
21. **Finance assumptions** (also in comments in `packages/finance-engine/src/finance.ts`): fees include
    18% GST; caps limit the ₹ reward per month (category first, then a `total` cap scales every category
    down); year 1 = joining fee + welcome benefit with no renewal fee; ongoing = renewal fee after waiver;
    the waiver uses projected spend minus excluded categories; a held card worth less than ₹0 counts as
    ₹0 for leakage (you'd close it). Reward rates are stored as % value back, already converted from
    points (per the §1.2 schema), so the engine never multiplies by `redemption_value` again; that
    column is kept for the breakdown notes.
22. **`formatInr`** lives in finance-engine and is hand-rolled (₹1,23,456), because Hermes' `Intl`
    en-IN grouping isn't reliable in every Expo Go build.
23. **Web upgraded to React 19.3** (handoff risk noted in the checkpoint 2 plan). Expo SDK 58 needs
    React 19.3, and with a hoisted `node_modules` two Reacts broke 47 web tests. Web, `@perq/ui` and
    mobile now share one `react@19.3.0`. All web tests pass and pages render; `expo-doctor` reports 20/20.
24. **Mobile routes live in `apps/mobile/src/app`** (Expo SDK 58 convention). Auth gating uses
    `Stack.Protected`; tabs are Home / Ember / Cards / Profile. Diagnostics opens from a long-press on
    the Profile title, and also on the PERQ wordmark on the Welcome screen, so it works before sign-in.
25. **SSE on the phone uses `expo/fetch`.** Its streaming `ReadableStream` body works in Expo Go on
    SDK 58 (per the SDK docs), so no `react-native-sse` and no polling fallback.
26. **CORS** is only on the mobile-facing API routes (`apps/web/middleware.ts`) and only matters for the
    Expo web preview; native requests ignore CORS. These routes authenticate by Bearer token.
27. **Email lookups are case-insensitive** and new emails are stored lowercased. Web register, Auth.js
    Credentials and the mobile routes share `lib/users.ts`.
28. **Icon/splash** are generated placeholders: a chartreuse flame on navy, with a `navy-900` splash.
    Cabinet Grotesk Bold/Extrabold TTFs are bundled from Fontshare (ITF Free Font License, copy in
    `apps/mobile/assets/fonts/`).
29. **iPhone check deferred to the end.** I can't scan the QR, so checkpoint 7 was verified by an iOS
    Metro export (bundles cleanly), `expo-doctor`, and the full sign-up → tabs → Diagnostics flow in
    the Expo web preview against the real API. The on-device check is in RUNNING.md.
30. **Card research method.** Every verified number was read on the issuer's own product page, T&C
    PDF or MITC on 2026-10-31 (HDFC's site blocks headless browsers, so its own PDFs were used). Web
    search was only for finding URLs. Notes per card are in `packages/db/data/research-notes.md`;
    the dataset is generated by `packages/db/data/build-cards.py`.
31. **29 verified, 11 unverified.** Unverified cards are stored but excluded from ranking. Reasons:
    the issuer doesn't publish a ₹ value per point (ICICI Coral RuPay and Platinum Chip, HSBC Visa
    Platinum, TravelOne and RuPay Platinum, Amex MRCC, OneCard), the site blocks automated reading
    (Scapia/Federal, AU LIT, Jupiter Edge), or the reward rate isn't on the page (Kotak 811).
32. **Fintech co-brands:** Kiwi is verified from its official card-program page (issuer YES Bank),
    since that is where the issuer's terms are published.
33. **Composition deviation:** 11 entry/co-brand + 9 lifetime-free instead of 10 + 10. Three more
    verified ₹0-fee cards sit in the secured and RuPay buckets (IDFC WOW, Axis Insta Easy, Kiwi).
    Candidates dropped from the handoff list: AU LIT (blocked), ICICI Coral RuPay (unverifiable
    point value). IDFC WOW and Kotak 811 are in.
34. **Modelling rules for rates** (in CARDS_README): points converted at the bank's stated value or
    the statement-credit value; merchant-specific rates apply to a category only when the merchant is
    one of its two main platforms or it's a fuel co-brand at its own pumps; paid memberships (Prime,
    Kiwi Neon) are not assumed; non-linear caps (Airtel Axis bills) fall back to the base rate;
    milestones not restated after a 2026 change (Regalia Gold) are excluded.
35. **Cap groups** were added to finance-engine. Banks often cap several categories together
    (SBI Cashback's "₹2,000 on all online"), which per-category caps can't express.
36. **Eligibility defaults** where banks don't publish them: min age 21 (18 for secured, or the
    bank's stated age); unsecured cards for salaried/self-employed; secured and lifetime-free cards
    also for students. Published income floors are stored (HSBC TravelOne ₹50k/month, Amex ₹37.5k).
37. **Catalogue swap:** the seed marks every active card not in `cards.json` as discontinued (97 rows:
    the old 123-card unverified seed plus D15 web-search rows). Old ids are reused where it's the
    same card, so existing arsenal rows survive.
