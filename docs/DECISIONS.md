# Decisions log (Step 0 + Step 1)

Judgement calls made while working through `docs/specs/PERQ_Handoff_Step0_Step1.md`. Newest at the bottom.

1. **File name.** The session prompt said `docs/DISIONS.md`; the handoff says `docs/DECISIONS.md`.
   I used `DECISIONS.md` and read the prompt's spelling as a typo.
2. **Spec location.** The handoff was at the repo root; moved to `docs/specs/PERQ_Handoff_Step0_Step1.md`.
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
38. **Quiz v2 assumptions** (in `packages/shared/src/quiz.ts`, shown in the breakdown): spend buckets
    ₹0 / ₹500 / ₹2,000 / ₹4,500 / ₹8,000 a month; travel 0 / 1.5 / 4 / 8 trips a year × ₹12,000 a trip
    (a return domestic flight + one hotel night); income eligibility uses the bottom of the user's range.
    The quiz doesn't ask about "everything else" spend, so it's ₹0. Value is never inflated by a guess.
39. **v1 → v2 migration** maps cards held, income (annual → monthly), the five spend answers, bills,
    travel (the higher of flights/hotels), fee tolerance and priorities. Occupation, UPI spend and the
    FD question weren't in v1: occupation defaults to salaried and UPI to ₹0, and the user is asked to
    confirm them. Anything unreadable starts the quiz again; nothing crashes.
40. **Recommender v2** lives in `packages/scoring-engine/src/recommend.ts` beside the legacy
    `scoreCards` (kept until the web switches at checkpoint 14). Eligibility rules beyond published
    bank criteria: students and under-₹25k incomes see only secured or lifetime-free cards; secured
    cards need `openToSecured` except for students; fee tolerance compares the higher of joining and
    renewal fee before GST. Age isn't asked, so the quiz assumes an adult.
41. **Priority boost** = ongoing value × 10% × (share of the card's rewards from the user's priority
    categories). "Cashback" priority matches cards that pay plain cashback. The boost only changes
    order. A test checks that ₹ values are identical with and without priorities, and that any card
    moved up was within 10%.
42. **Leakage** compares the best eligible verified card with the best held verified card. Held cards
    that are unverified or not in the catalogue can't be valued and are ignored. With no card the
    message says what the best card would add instead of "leaking".
43. **Recommender API** (`apps/web/lib/recommender/service.ts`): GET results always recomputes (fast and
    deterministic) and rewrites the `recommendations` rows only when the profile hash changes. The Top
    Pick's Ember explanation carries over while the Top Pick stays the same; otherwise results return
    `explanation: null` and the app calls `/api/recommender/explain`.
44. **Held cards:** `user_card_arsenal` is the single source of truth. The quiz's `cardsHeld`, the
    results toggle and the Profile toggle all write through it, and `answers.cardsHeld` mirrors it.
45. **Public finder rate limit:** 30 requests per IP per 10 minutes, in memory. On Vercel that's per
    warm instance; fine for a demo. It needs a shared store (e.g. Upstash) before real launch.
46. **Grounding is enforced in code.** After Gemini writes an explanation or chat reply, every ₹ figure
    must appear in that run's tool outputs (`ungroundedRupees`). If one doesn't, the template answer is
    used. Template answers only print numbers that come straight from the engine (no subtraction in
    prose).
47. **Narration labels** follow handoff §1.6: "Checked your answers" → "Filtered 40 cards to the N you
    can get" → "Worked out your yearly value for each" → "Writing your recommendation". When Gemini is
    off (no key, quota, or `GEMINI_DISABLED=1`), the same steps are emitted ~350 ms apart before the
    template, so the phone still shows them ticking in.
48. **Gemini quota → model order flipped.** The eval showed this key's free tier allows
    `gemini-3.5-flash` only 5 req/min and 20 req/day. An explanation is 3–4 requests, so that's about
    five a day. `gemini-3.5-flash-lite` passed the same eval and now leads; `flash` is the fallback.
    The explanation cache (reused while the Top Pick is unchanged) also keeps calls down. For a demo
    with several people, consider a paid key.
49. **Eval fixtures pin the engine's real ranking.** My first guesses for four fixtures were wrong (HSBC
    Live+ beats Swiggy HDFC for heavy food delivery once groceries count), so they assert what
    finance-engine computes. The offline half runs in `pnpm test`; the live half is `pnpm eval`
    (10/10 on 2026-10-31).
50. **Chat thread** is `recommender`, keeps the last 12 messages as history, and is capped at 40 user
    turns. The old `/api/chat` and `/api/quiz/submit` (old engine + D15 web search) stay until the web
    moves over at checkpoint 14.
51. **Mobile flow:** a signed-in user with no saved answers is sent to the quiz from the tabs layout.
    The quiz is a pure reducer (`features/quiz/reducer.ts`, unit-tested); the FD question appears as
    question 8 when it applies, so progress reads "n of 8" for students and incomes under ₹25k.
52. **Explanations after edits:** when the Top Pick changes and has no explanation, the Cards tab asks
    Ember in the background and shows its current step under the one-line reason until the text arrives.
53. **The Top Pick card is plain:** a chartreuse outline and a small "EMBER'S PICK" badge (the only
    chartreuse fill), no imagery or call to apply, so it doesn't read as an ad.
54. **Web preview only:** the session token falls back to `localStorage` on web, because SecureStore
    doesn't exist there. On iPhone it's always the Keychain.
55. **Web on v2:** the landing page has the public "Find your card" finder (top 3, no login). `/quiz`
    and `/results` now use quiz v2 and the v2 API; the home "Take the quiz" goes to `/quiz`, and the web
    Ember chat panel talks to `/api/ember/chat`. The quiz reducer moved to `packages/shared` so web and
    mobile ask exactly the same questions. Web "See the math" is an inline expandable section.
56. **v1 web code is unlinked, not deleted** (listed in AUDIT.md §8), the same treatment the handoff
    asks for with Feature 3.
57. **Logo:** the existing PERQ logo image is the old gold wordmark. I didn't redraw the brand logo;
    swap `apps/web/public/perq-logo.png` when the new-palette version exists.
58. **Repo tidy-up (on request).** The root keeps only README, CLAUDE.md and workspace config.
    Specs are in `docs/specs/`, product docs/PRDs/plans/design system in `docs/product/`, future-feature
    plans in `docs/plans/`, the mockup in `docs/design-reference/`, images in `docs/assets/`, and the
    session prompt in `docs/prompts/`. Your previously untracked drafts are now committed there, as
    you asked to include all docs.

---

# Step 2 (Money Manager) decisions

Working from `docs/specs/PERQ_Handoff_Step2_Money_Manager.md`.

59. **Spec location.** The Step 2 handoff arrived at the repo root and was moved to `docs/specs/`
    beside the Step 0/1 handoff.
60. **Schema (migration 0009).** Additions beyond the handoff's table list: `user_merchant_overrides`
    (per-user recategorisations must be remembered but never written to the shared
    `merchant_categories`); `statements.marked_paid_at` (mark-as-paid belongs to a statement's due,
    not the card); `user_profile.spend_source` + `synced_spend` (§9 kept off the quiz answers);
    `user.is_demo` (demo reset/time travel only touch demo users); `consents` is append-only for a
    dated history. Savings goals are in **`savings_goals`**, because `goals` is the retired Feature 3
    goal-search table. `chat_messages.thread_ref` sits beside the existing `thread`.
61. **IDs are app-generated** (Drizzle `$defaultFn(randomUUID)`) like every existing table, not DB
    defaults. Enum-like columns are `text`, validated by zod in `packages/shared/src/money.ts`.
62. **Delete cascade verified against Neon** on 2026-11-01: deleting a user removed every row in
    card_accounts, statements, transactions, nudges, financial_state_cache, savings_goals,
    activity_events and consents.
63. **Statements live in a new `packages/statements`** (server-only: PDF decrypt/extract, extraction
    orchestration, synthetic generator). finance-engine stays pure and React Native-safe, so
    reconciliation, categorisation rules, state and nudge rules live there instead.
64. **Synthetic statements** (`pnpm statements:fake`): seeded, reproducible, pdfkit with an AES user
    password, layouts A (HDFC-like summary box + table with "Cr"), B (SBI-like two columns with
    Debit/Credit columns) and C (Axis-like, 3 pages with a points block). They print "Rs." because
    Helvetica has no ₹ glyph, which matches many real statements. Every holder and card number is
    fictional, and each file says "SYNTHETIC TEST STATEMENT" on it. One line deliberately carries a full
    16-digit test card number (Visa's public test number), so §12 stripping is exercised. Real
    statements belong in `fixtures/private/`, which is gitignored.
65. **PDF library: `pdfjs-dist@4.10.38` legacy build**, not `unpdf`. unpdf 1.x and 2.x (and pdf.js v5)
    need Node 22's global `Iterator`; this repo runs Node 20. The legacy build runs on Node 20 and on
    Vercel without a worker thread. The PDF bytes and password only live in local variables of
    `extractPdfLines`. They're never written, cached or logged, and pdf.js gets a copy so a retry with
    another password still works.
66. **Deterministic read first, Gemini second.** `parseStatementPdf` runs a heuristic parser (labelled
    summary block, date-led rows, `Cr`/`Dr` suffixes or Debit/Credit columns by x position). If that
    reading **reconciles**, it's accepted (`model = "heuristic"`) and **no statement text goes to
    Gemini**. Only a reading that doesn't reconcile goes to Gemini structured extraction
    (`STATEMENT_RESPONSE_SCHEMA`, chunked by whole pages over ~18k chars, header once, adjacent-chunk
    duplicate drop). On a failed reconcile there's one retry naming the figures, then the better of the
    two. This keeps the free-tier quota for the cases that need it, sends less personal data to a
    third party, and never lowers the bar, because acceptance is still the §5.4 reconcile. The
    heuristic reads all three synthetic layouts exactly; real statements will lean on Gemini more.
67. **Reconcile tolerance** is computed on the printed (paise) figures, before rupee rounding. Unprinted
    fee and finance-charge figures count as 0. Missing total/previous/payments/purchases means not
    reconciled.
68. **Categorisation precedence:** kind (payments, refunds, cashback, fees/GST, interest, EMI) → the
    user's own override → keyword rules → UPI tag → shared cache → Gemini batch → "other". Refunds take
    their merchant's category, so they net against that category's spend. The handoff lists the cache
    before AI and the override as "wins", which this order satisfies. Merchant normalisation strips
    gateway prefixes (PAYU*, RAZ*, BBPS*, …), UPI handles, references and phone numbers, cities,
    company words and trailing branch numbers. It deliberately keeps "INDIA" so "AIR INDIA" still
    matches travel. 49 real-looking descriptors are in the test table.
69. **The AI batch sees merchant names only** (no amounts, dates or user data), validates every answer
    against the 17 categories, and only its answers go to `merchant_categories`. User overrides live in
    `user_merchant_overrides` and a test asserts they never reach the shared cache. If the AI fails or is
    off, unknown merchants become "other".
70. **Upload transport: base64 PDF in a JSON body**, not multipart. It works the same from Expo Go,
    the web preview and tests, and Vercel's ~4.5 MB body cap means a **3 MB PDF limit** (base64 adds
    a third). Real statements are usually well under 1 MB. The server decodes into a `Uint8Array`,
    parses, and zero-fills it in `finally`.
71. **Parse token = signed draft (JWS, HS256, `PARSE_TOKEN_SECRET`, 15 min, bound to the user)**
    instead of a server-side cache. Parse and confirm can land on different Vercel instances. The token
    holds only the extracted figures and lines the user is reviewing (never the PDF or password), and a
    tampered or expired token is rejected. Confirm re-runs reconciliation on whatever is saved,
    including the user's corrected figures.
72. **On the phone**, the document picker's temporary copy is read into memory as base64 and deleted
    immediately (`File.delete()`). The password is only kept if "Remember on this phone" is on, in the
    Keychain via expo-secure-store, keyed by issuer + last 4 with a small index for the "use remembered"
    buttons.
73. **Wrong passwords**: 5 per user per 10 minutes, in memory (per warm instance, like the public finder
    limit). Logs carry only the error code; a manual check of the dev log after a parse found no
    password, figure, merchant or card number.
74. **Demo/dev sample statements:** `GET /api/demo/fixtures?layout=A|B|C` (only with
    `DEMO_ENABLED=true`) generates a synthetic statement in memory. `/demo/statements` lists them with
    passwords so one can be saved to Files in Safari, and the upload screen has "Try a synthetic
    statement" buttons in dev or demo builds (`EXPO_PUBLIC_DEMO=true`). The headless browser can't drive
    Expo's web file picker, so checkpoint 6 was verified with these buttons in the web preview:
    SBI sample → narration → review (reconciled, matched to Cashback SBI Card) → saved. The on-iPhone
    check is in RUNNING.md.
75. **pdfkit and pdfjs-dist are `serverExternalPackages`** in Next; bundling them loses their font and
    worker files.
76. Confirm takes several seconds in dev because it's ~8 sequential Neon HTTP round trips (account
    upsert, replace, insert, transactions, arsenal, cache, activity). That's fine for now; batch it if it
    shows up in real use.
77. **Financial state details** (`packages/finance-engine/src/state.ts`): all calendar maths in IST.
    A balance override counts only if it was updated after the latest statement date. "Mark as paid"
    removes that due from `totalDueAll`. The next statement is assumed one month after the last.
    Fee-waiver pace counts purchases net of refunds since the 1st of the anniversary month; when that
    month is unknown it starts from the card's earliest transaction (`startAssumed: true`). Month spend
    excludes transfers, fees/interest, EMI and cash. Best card in hindsight compares flat % rates
    between held catalogue cards and ignores caps, so it's an estimate; the UI says "about". Goals
    track `expectedSaved` on a straight line from creation to target date.
78. **State cache** is keyed by `STATE_VERSION` + the IST day, because the state depends on today. It's
    deleted on every money write via `invalidateState`.
79. **Nudge engine layout.** Rules, thresholds (`NUDGE_CONFIG`), learned suppression and the cap/quiet-hours
    planner are pure functions in `packages/finance-engine/src/nudges`, and every number a rule's copy may
    use sits in its payload. `apps/web/lib/money/nudgeEngine.ts` only loads rows and saves the plan. It
    rebuilds the state fresh instead of reading the per-day cache, so a save made earlier today is reflected.
80. **When the engine runs.** It runs after every money write (`afterMoneyWrite`), and again from the daily
    cron (checkpoint 9). Errors there are logged and swallowed so a nudge bug can't fail a statement save.
    The daily cap of 2 is counted on `sent_at` per IST day. A nudge held by the cap or by quiet hours is
    stored as `queued` with `scheduled_for` at the next 09:00 IST, and it competes on priority with that
    day's fresh candidates.
81. **Dedupe across all statuses.** A dedupe key that was ever stored (sent, dismissed, expired, queued)
    is never created again. The keys include the statement date or month, so the next cycle gets a fresh
    key. History looks back 120 days, plus any rows still queued.
82. **High-utilisation levels.** Spec §7.2 gives one rule. It's split into `warn` (≥ 70% and the statement
    closes within 5 days, priority 75, with "pay ₹X to get under 30%") and `info` (≥ 30%, priority 40), so
    it is urgent only when acting on it still changes the reported figure.
83. **Push in Expo Go: local-notification fallback.** Checked against the SDK 58 docs (AUDIT Step 2 #11).
    Expo Go dropped remote push on Android in SDK 53. On iOS, `getExpoPushTokenAsync` needs an EAS
    `projectId`, and this app has none (creating one needs an Expo account and `eas init`, which this
    step doesn't do). So in Expo Go the app runs in **local mode**: on sign-in and on every foreground
    it fetches `GET /api/nudges/upcoming` and replaces its scheduled local notifications with that list.
    The list comes from `simulateUpcoming`, which is the same rules and planner run forward over 7 days
    at 09:00 IST, including nudges already queued, so cap and quiet hours hold on the device too.
    Tapping one opens `/nudge/key:<dedupeKey>`, and opening the inbox runs the engine (throttled to
    every 5 minutes) so that nudge exists by then. The server push path (`expo-server-sdk`,
    `/api/push/register`, `DeviceNotRegistered` cleanup) is built and used automatically once a
    projectId is in app.json (`extra.eas.projectId`). Local notifications use template copy.
    Remote pushes use the Gemini copy.
84. **Nudge copy.** Gemini sees only the rule id, the payload and the template, and has an 8-second
    budget. `validateNudgeCopy` (finance-engine) rejects: text over 90/160 characters, any number not in
    the payload or the code-written template (which covers constants like "30%"), shorthand like "₹18k"
    or "1.2 lakh", exclamation marks, and urgency words. A rejection sends the template, and the log line
    keeps the reason with digits masked. Copy is written only when a nudge is sent; queued rows hold the
    template until then.
85. **`nudges.why`** (migration 0010) keeps each rule's plain-English explanation from creation time. Then
    "Why am I seeing this?" still matches the nudge after newer statements change the state.
    `/api/nudges/:id/why` adds the rule description, labelled payload figures and the data date.
86. **Notification consent** is its own `consents` row (source `notifications`), recorded by the explainer
    screen shown on the first Home visit after sign-in. That screen comes before the OS prompt. Push and
    the upcoming list both check it.
87. **Cron** lives in `apps/web/vercel.json` (`30 3 * * *`). It needs `CRON_SECRET` and iterates users
    with an active card account, 10 at a time with `allSettled`. `pnpm nudges:run --user <id> [--now
    YYYY-MM-DD] [--upcoming]` runs the same code locally. A date-only `--now` means 09:00 IST that day.
88. **Gemini data terms (§12).** On the free tier, Google may use prompts and responses to improve its
    products, and humans may review them. The paid tier (Cloud Billing on the key) excludes that. What
    Gemini receives here is statement text (extraction fallback only), merchant names (categorisation)
    and nudge payloads (copy). **Recommendation: move the key to the paid tier before any real user's
    statement is processed.** Until then, use only synthetic statements.
89. **Money tools live in `apps/web/lib/ember/money/`**, next to the Step 1 recommender tools, not in
    `packages/ai` as §8 literally says. They need the user's DB rows, and `packages/ai` stays free of DB
    and app code; they still run through the Step 0 `runEmber` registry. There is one extra read tool,
    `listStatements`, because the model has no other way to learn statement ids for `getStatement`.
    Transactions reach the model only as the normalised merchant, never the raw line.
90. **One Ember, two tool sets.** `/api/ember/chat` gives the model the recommender tools when the quiz
    is done, the money tools when a statement exists, or both. It needs one of the two, and the run's
    `maxPermission` is 3. `proposeBudget`/`proposeGoal` are level 3: they emit a `proposal` SSE event
    and save nothing, and the app saves only on Confirm. `proposeBudget` takes a list of
    `{category, amount}`, because Gemini tool schemas can't express a free-form record.
91. **Threads.** The main thread stays `thread = "recommender"` with no `thread_ref`, so Step 1 history
    is kept. Nudge and card threads are `thread = "money"` plus `thread_ref` (`nudge:<id>`, `card:<id>`).
    Opening a nudge thread with no messages stores Ember's deterministic opening (the nudge's body plus
    an offer), and the response carries rule-specific chips. "Mark as paid", "Remind me tomorrow" and
    "Upload statement" are app buttons that never go to the model. Replying in a nudge thread marks it
    `acted`. "Remind me" re-queues it for 09:00 IST tomorrow and the planner sends it then.
92. **Grounding and fallback.** Every reply goes through `ungroundedRupees` against this turn's tool
    outputs. A miss, or no Gemini, gives a deterministic answer: the nudge body in a nudge thread, the
    total due otherwise, or the Step 1 fallback for recommender-only users.
93. **agent_runs redaction.** `logAgentRun` stores `redactRun(record)`: tool name, ms, status, input key
    names, output shape and `count`. Narration and errors keep their wording, with ₹ amounts and 3+
    digit runs masked, and errors also lose upper-case (merchant) words. Tested in `test/money/redact.test.ts`.
94. **Nudge engine after writes uses `after()`** (Next 15), so a statement save or mark-paid returns
    without waiting on Gemini copy. Gemini copy took about 9 s per call on the free tier, so the copy
    budget is 20 s, which is fine off the request path.
95. **`PATCH /api/card-accounts/:id` came early** (checkpoint 10, not 11) because the nudge chat's
    "Mark as paid" needs it. `markPaid` sets `marked_paid_at` on the latest statement. It's the user's
    own flag, and Ember never claims a bill was paid.
96. **Checkpoints 11 and 12 are one commit.** Home links to the inbox and budgets, and both checkpoints
    edit the same API client, route layout and shared schemas, so a split would leave a commit that
    doesn't typecheck.
97. **Card detail is `/account/[id]`.** `/card/[id]` is already Step 1's "See the math" for a catalogue
    card. Category bars on Home open `/transactions?category=`, and due amounts open the card. That
    meets "every ₹ figure taps to its source" for the figures that have a source screen. Card threads
    open `/chat/card:<id>`, and the chat prompt tells Ember which card the thread is about.
98. **Recategorise remembers per merchant** (default on). It moves the user's other transactions from
    the same merchant and kind, and writes `user_merchant_overrides`. It never touches the shared cache.
99. **Budget prefill** uses finance-engine `averageMonthlySpend`: per card, the mean of its latest 3
    reconciled cycles, summed across cards. Purchases add, refunds and cashback subtract, and
    transfers/fees/EMI/cash are excluded. The UI rounds each figure up to ₹500. The same function feeds
    the recommender sync (checkpoint 13). The screen saves the recurring default (`month = null`). A
    per-month budget is supported by the API and not exposed in the UI yet.
100. **Savings goals API is `/api/goals`** (GET/POST) and `/api/goals/:id` (PATCH). Feature 3's
    `/api/goals/submit` is a static segment, so it doesn't clash.
101. **Deleting all financial data** removes card accounts (which cascade to statements and
    transactions), nudges, nudge/card chats, budgets, goals, merchant overrides, the state cache and
    activity. It resets the profile to quiz spend. **Consents stay** as the dated record of what the
    user agreed to. `DELETE /api/me` deletes the account, and every user table cascades from `user`.
    The phone also forgets remembered statement passwords and cancels scheduled local notifications.
102. **Inbox swipe-to-dismiss** uses RN `PanResponder` (no new native module), with an accessibility
    "Dismiss" action for VoiceOver.
