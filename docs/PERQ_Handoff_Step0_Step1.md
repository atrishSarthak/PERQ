# PERQ: Build Handoff, Step 0 (Foundation) and Step 1 (Card Recommender)

*For a Claude Code session working in the existing PERQ repository. Read this whole file before writing code. When this file and the existing code disagree on a small detail, keep what the code already does and note it; when they disagree on a decision marked **Locked**, follow this file.*

Last updated: 2026-10-31

---

## 1. What "done" looks like

At the end of this handoff:

1. The repo is a Turborepo + pnpm monorepo with `apps/web`, `apps/mobile` and shared `packages/*`.
2. The AI agent is called **Ember** everywhere (code, prompts, UI, database defaults). No "MIMIR" remains.
3. The founder runs one command, scans a QR code with an **iPhone camera**, and the PERQ app opens in **Expo Go**.
4. In the app they can sign up, take the 7-question card quiz, watch Ember work, see ranked card recommendations in ₹ per year, open a card's breakdown, mark cards as held, chat with Ember about the result, and edit any answer to see results update.
5. The same recommender runs as a public, no-login card finder on the web landing page.
6. Unit tests for every finance function pass, and the Ember eval suite passes.

Everything below exists to get there. Nothing outside this scope (Card Manager, extension, Swiggy) should be built yet, but the foundation must make those easy to add.

---

## 2. Ground rules (Locked)

- **Inspect before you change.** Section 4 is a required audit. The Feature 1 web app (Next.js, Neon, Drizzle, Auth.js, Gemini) already exists. Upgrade it; do not rebuild it.
- **Code computes, the LLM reasons.** Every rupee figure comes from a pure, unit-tested function in `packages/finance-engine`. Gemini chooses tools, sequences them and writes explanations. It never does arithmetic that reaches the user.
- **Secrets stay server-side.** `GEMINI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `MOBILE_JWT_SECRET` never appear in `apps/mobile` or any client bundle. The mobile app only knows `EXPO_PUBLIC_API_URL`.
- **Shared logic lives in `packages/*`.** Apps contain screens and routes only.
- **No dark patterns.** No streaks, countdowns, scarcity or urgency copy. The Top Pick must not look like an ad.
- **No affiliate influence on ranking.** Ranking uses only user data and card terms.
- **Must run in Expo Go.** Step 0 and Step 1 use no custom native modules. If a library needs a dev build, pick another one.
- **Commit at every checkpoint** in Section 11, with a clear message.

---

## 3. Brand and design tokens (Locked, replaces the old palette)

The previous pure-black theme and gold accent are retired. Use these four colours, sampled from the brand swatches:

| Token | Name | Hex | Pantone ref |
|---|---|---|---|
| `navy` | Midnight Navy | `#1B1C45` | 2768 CP |
| `ice` | Ice Blue | `#E2EAEE` | P 115-9 C |
| `electric` | Electric Blue | `#2B4A8E` | P 104-8 C |
| `chartreuse` | Chartreuse | `#E0D847` | P 166-8 C |

Derived tokens (create these; tune by eye only if contrast still passes AA):

| Token | Hex | Use |
|---|---|---|
| `navy-900` | `#12132F` | Dark background (app default) |
| `navy-800` | `#1B1C45` | Cards / surfaces on dark |
| `navy-700` | `#2A2C5E` | Borders, dividers on dark |
| `electric-400` | `#5B7FD1` | Links and focus rings on dark (raw electric is too dark on navy) |
| `ice-50` | `#F4F7F9` | Light background |
| `ice-300` | `#B9C7CF` | Muted text on dark |
| `chartreuse-600` | `#B8B01F` | Chartreuse pressed state |
| `success` | `#3FB68B` | Positive values |
| `danger` | `#E5484D` | Errors, warnings |

**Roles**

- **Dark theme (default):** background `navy-900`, surfaces `navy-800`, primary text `ice`, muted text `ice-300`.
- **Light theme:** background `ice-50`, surfaces white, primary text `navy`, muted text `#5A6378`.
- **Primary buttons:** fill `electric`, text white.
- **Ember accent:** `chartreuse`. Use it for Ember's avatar, narration checkmarks, the Top Pick badge and key ₹ numbers on dark backgrounds. Chartreuse is an accent, never a large background except the Top Pick badge. **Never put chartreuse text on light backgrounds** (fails contrast). On light theme, use `electric` for those accents.
- Text on chartreuse is always `navy`.

**Typography:** headlines in Cabinet Grotesk (bold/extrabold), body in Lexend Deca. On mobile, load Lexend Deca via `@expo-google-fonts/lexend-deca`. Cabinet Grotesk is a Fontshare font: download the free TTFs into `apps/mobile/assets/fonts/` and load with `expo-font`. If Cabinet Grotesk can't be fetched, fall back to Lexend Deca SemiBold and leave a TODO.

**Implementation:** put all tokens in `packages/design-tokens/src/tokens.ts` as plain objects (colours, spacing on a 4-pt scale, radii, font sizes). Export:
- a Tailwind preset for `apps/web` (update the existing theme to use it),
- a `theme` object for `apps/mobile`.

One source of truth, two consumers.

---

## 4. Step 0.1: Audit the existing repo (do this first, write the result down)

Before changing anything, read the repo and create `docs/AUDIT.md` covering:

- Current folder structure and whether it is already a Turborepo.
- What Feature 1 code exists: quiz, results page, arsenal toggle, follow-up chat, scoring engine, `runGeminiAgent`, narration (SSE), caching, fallback explanation, evals.
- Drizzle schema tables and the quiz answer schema (`quizAnswersSchema`, currently 13 fields; Feature 3 work may have extended it to 19).
- Any Feature 3 (goal advisor / Firecrawl) code. **It is retired.** Leave it in place but unlinked from navigation, and list it in AUDIT.md as "to delete later". Do not spend time on it.
- Every occurrence of "MIMIR" / "mimir" (files, folders, prompts, DB defaults, UI strings).
- Test setup (Vitest) and whether tests pass now.

Then continue. Adapt the paths in this file to what actually exists.

---

## 5. Step 0: Foundation

### 0.2 Monorepo shape

Target layout (adapt names to what exists):

```
perq/
├── apps/
│   ├── web/              Next.js: landing + public card finder, all API routes
│   └── mobile/           Expo (Expo Router): the PERQ app
├── packages/
│   ├── ai/               Ember runner, tool registry, prompts, narration labels
│   ├── finance-engine/   pure money math (new)
│   ├── scoring-engine/   card ranking (existing, refactored to use finance-engine)
│   ├── db/               Drizzle schema, migrations, card seed script + data
│   ├── design-tokens/    tokens.ts, Tailwind preset, RN theme
│   ├── shared/           zod schemas + TS types shared by web and mobile (new)
│   ├── ui/               web components (existing)
│   └── config/           tsconfig / eslint / prettier
├── turbo.json
├── pnpm-workspace.yaml
└── .npmrc
```

- Add `node-linker=hoisted` to `.npmrc`. Expo and Metro need hoisted node_modules in pnpm monorepos.
- Use the Expo SDK that matches the **current Expo Go on the App Store**. Create the app with `pnpm create expo-app apps/mobile --template tabs` (or the current tabs template) and confirm the SDK version printed by Expo Go matches.
- Metro monorepo support: recent Expo SDKs auto-configure this. If imports from `packages/*` fail, add a `metro.config.js` with `watchFolders` set to the repo root.
- Shared packages consumed by mobile must be plain TypeScript (no Node-only APIs, no Next imports). `packages/finance-engine`, `packages/shared` and `packages/design-tokens` must work in React Native.
- Root scripts: `pnpm dev:web`, `pnpm dev:mobile`, `pnpm test`, `pnpm eval`, `pnpm db:migrate`, `pnpm db:seed-cards`.

### 0.3 Rename MIMIR to Ember

- Rename folders/files (`lib/mimir` to `lib/ember`, `mimir-explanations.eval.ts` to `ember.eval.ts`, etc.), identifiers, prompts and UI copy.
- Narration copy: "Ember is checking your profile", "Ember compared 40 cards", "Ember is writing your recommendation".
- DB: any `agent` column defaulting to `'MIMIR'` becomes `'Ember'`. Write a migration that changes the default and updates existing rows.
- Finish with `grep -ri mimir` returning nothing outside `docs/AUDIT.md` and git history.

### 0.4 Ember agent core (`packages/ai`)

Turn `runGeminiAgent` into a general runner every feature will reuse.

```ts
type PermissionLevel = 1 | 2 | 3 | 4 | 5; // observe, notify, prepare, execute, never

interface EmberTool<I, O> {
  name: string;
  description: string;         // what the model sees
  input: ZodSchema<I>;
  permission: PermissionLevel;
  narration?: string;          // e.g. "Ember compared {count} cards"
  handler: (input: I, ctx: EmberContext) => Promise<O>;
}

runEmber({
  userId, task,                // e.g. 'recommendation' | 'chat'
  messages, tools,
  maxPermission,               // runner refuses any tool above this
  onStep,                      // streams narration steps to the client
}): Promise<{ text: string; steps: Step[]; runId: string }>
```

Requirements:
- The runner rejects a tool call above `maxPermission` in code and returns an error to the model. Level 5 tools are never registered.
- Validate every tool input with zod before calling the handler.
- Cap tool rounds (keep the existing cap or use 6).
- Keep the existing retry/backoff for transient Gemini errors.
- Log each run to an `agent_runs` table: `id, user_id, task, steps (jsonb: tool, input, output summary, ms), model, tokens if available, status, created_at`.
- Keep the existing fallback pattern: if Gemini fails, return a template explanation built from tool outputs.
- Keep a banned-phrase list (urgency/scarcity words, "guaranteed", "best ever", etc.) and strip or regenerate when hit.
- Pin the Gemini model in one constant; confirm the current Flash model name and free-tier limits at build time.

### 0.5 `packages/finance-engine` (new)

Pure functions, no I/O, Vitest coverage for each. Step 1 needs these (signatures can adapt):

```ts
monthlyRewardsByCategory(spend, card)   // applies rate, monthly caps, point value
annualRewards(spend, card)              // × 12, plus annual milestone benefits if reached
annualFeeAfterWaiver(spend, card)       // fee minus waiver if projected annual spend ≥ threshold
netAnnualValue(spend, card, { year })   // year 1 includes joining fee + welcome benefit; ongoing excludes them
leakage(spend, heldCards, eligibleCards)// best eligible net value − best held net value (≥ 0)
```

All money in **integer rupees** (round at the end, not during). Point value comes from `cards.redemption_value` (₹ per point). Document every assumption in comments.

### 0.6 Mobile auth

Auth.js cookie sessions are awkward in React Native. Add a token path alongside the existing web auth:

- `POST /api/mobile/auth/signup` and `POST /api/mobile/auth/login` (email + password, reuse the existing users table and hashing). Return a signed JWT (`jose`, HS256, `MOBILE_JWT_SECRET`, 30-day expiry) plus the user.
- `GET /api/mobile/auth/me`.
- A shared helper `getAuthedUser(req)` that accepts **either** the Auth.js session cookie **or** `Authorization: Bearer <jwt>`. All recommender and Ember routes use it.
- Mobile stores the token in `expo-secure-store` and sends it on every request.
- No Google sign-in in this step (it needs extra native config for Expo Go). Leave a TODO.

### 0.7 Mobile shell (`apps/mobile`)

- Expo Router. Route groups: `(auth)` for welcome/sign-in/sign-up, `(onboarding)` for the quiz, `(tabs)` for the main app.
- Tabs: **Home**, **Ember**, **Cards**, **Profile**.
  - Home: for Step 1, shows the Top Pick and leakage summary, plus a placeholder card "Card Manager arrives next".
  - Ember: chat.
  - Cards: full results list with filters.
  - Profile: answers (editable), arsenal, sign out, theme toggle (system/dark/light).
- `src/lib/api.ts`: typed fetch client using `EXPO_PUBLIC_API_URL` and the stored token, with zod-parsed responses from `packages/shared`.
- Data fetching with TanStack Query.
- Theme from `packages/design-tokens`. Dark is the default.
- A hidden **Diagnostics** screen (long-press the Profile title) showing the API URL and a `/api/health` result. This saves time when the phone can't reach the backend.
- App name "PERQ", simple placeholder icon in navy with a chartreuse mark, splash in `navy-900`.

### 0.8 Backend reachability from the iPhone

The phone must reach the Next.js API. Support both:

1. **Local (development):** run web with `next dev -H 0.0.0.0`; set `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000` in `apps/mobile/.env`. Phone and laptop on the same Wi-Fi.
2. **Deployed (demo):** deploy `apps/web` to Vercel; set `EXPO_PUBLIC_API_URL=https://<project>.vercel.app`.

Add `GET /api/health` returning `{ ok: true, version }`. Add CORS headers for the mobile routes only if needed (native fetch doesn't enforce CORS, but the web preview does).

### Step 0 acceptance

- [ ] `docs/AUDIT.md` exists.
- [ ] Monorepo builds: `pnpm install && pnpm test` passes.
- [ ] No "MIMIR" left in code, prompts, UI or DB defaults.
- [ ] `runEmber` with tool registry, permission check, `agent_runs` logging, fallback, and tests for the permission refusal.
- [ ] `finance-engine` exists with passing tests.
- [ ] Web still works as before, with the new colours.
- [ ] `pnpm dev:mobile` shows a QR; scanning on iPhone opens the app in Expo Go; sign-up and sign-in work against the API; Diagnostics shows the health check passing.

---

## 6. Step 1: Card Recommender

### 1.1 Quiz v2 (Locked: 7 questions plus 1 conditional)

| # | Key | Question | Input |
|---|---|---|---|
| 1 | `cardsHeld` | Which credit cards do you have? | Searchable multi-select over the catalogue, plus "I don't have one yet" |
| 2 | `occupation` | What do you do? | Student / Salaried / Self-employed |
| 3 | `monthlyIncome` | Your monthly income (take-home is fine) | Below ₹25k / ₹25–50k / ₹50k–1L / ₹1–2L / ₹2L+ |
| 4 | `monthlySpend` | Roughly how much do you spend a month on… | **One screen**, a bucket per category: food delivery, online shopping, groceries, dining out, fuel, bills & subscriptions, UPI scan-and-pay. Buckets: ₹0 / <₹1k / ₹1–3k / ₹3–6k / ₹6k+ |
| 5 | `travelPerYear` | Flights or hotel stays per year? | Never / 1–2 / 3–5 / 6+ |
| 6 | `feeTolerance` | Annual fee you're OK with if rewards beat it | ₹0 only / up to ₹1,000 / up to ₹5,000 / any if worth it |
| 7 | `priorities` | What matters most? (pick up to 2) | Cashback / Travel & lounges / Dining / Shopping / Fuel / No preference |
| 7a | `openToSecured` | *Shown only if* occupation = Student or income < ₹25k: Would you consider a card backed by a fixed deposit? | Yes / No |

- One question per screen on mobile, progress "3 of 7", back button. Web uses the existing wizard updated to these questions.
- Bucket-to-number mapping lives in `packages/shared` (e.g. "₹1–3k" → ₹2,000 midpoint; "₹6k+" → ₹8,000; travel "3–5" → 4 trips × an average trip spend constant you document). Use midpoints consistently and show them in the breakdown so users see what was assumed.
- New zod schema `quizAnswersV2` with `schemaVersion: 2`. Old v1 profiles: map what you can (cards held, income, food, e-commerce, groceries, dining, fuel, fee tolerance, priorities) and ask the user to confirm the rest on next open. Do not crash on old rows.
- Network preference is a **filter** on results, not a question.

### 1.2 Card catalogue: 40 curated cards

Schema additions to `cards` (keep existing columns):

```
card_type            'secured' | 'unsecured'
fd_min_amount        nullable int (₹), secured cards only
lifetime_free        boolean
networks             text[]  (e.g. ['RuPay','Visa'])
upi_enabled          boolean (RuPay credit on UPI)
reward_rates         jsonb   per category: food_delivery, online_shopping, groceries,
                             dining, fuel, bills, upi, travel, other  (as % value back,
                             already converted using the card's point value; note the raw
                             points rule in reward_notes)
reward_caps          jsonb   per category monthly cap in ₹ (null = no cap)
reward_notes         text    plain-language rules and exclusions
min_age              int
eligible_occupations text[]
min_monthly_income   nullable int (₹)
fee_waiver_spend     nullable int (₹ annual spend that waives the fee)
welcome_benefit_value int (₹, conservative estimate)
source_url           text
source_updated_at    date
verified             boolean
```

**Composition** (40 total):
- 6 secured / FD-backed or student-friendly cards
- 10 lifetime-free or ₹0-fee cards
- 10 entry cashback / co-brand cards (shopping, food delivery, telecom, fuel)
- 6 RuPay cards that work on UPI
- 8 mid-tier rewards / travel cards a young professional can get

Candidates to **check** (confirm each is still issued and its current terms before including; drop or replace any that changed): Amazon Pay ICICI, Flipkart Axis, Axis Ace, SBI Cashback, HDFC Millennia, Swiggy HDFC, Tata Neu Plus HDFC, Tata Neu Infinity HDFC, Airtel Axis, IDFC FIRST Millennia, IDFC FIRST WOW (FD), Kotak 811 Dream Different (FD), AU LIT, OneCard, Kiwi (Yes Bank RuPay), ICICI Coral RuPay, IndianOil Axis, BPCL SBI Octane, HDFC Regalia Gold, Axis Atlas.

**Process:**
- Research terms from the bank's own product page and its MITC/terms PDF first. Use comparison sites only to find candidates.
- Store the data in `packages/db/data/cards.json`, loaded with `pnpm db:seed-cards`.
- Every card gets `source_url`, `source_updated_at` and `verified: true` only when the bank page was read. Anything uncertain stays `verified: false` and is excluded from ranking until checked.
- Be conservative: when a rate has conditions you can't model, use the lower rate and write the condition in `reward_notes`.
- Write `packages/db/data/CARDS_README.md` listing all 40 with source links.

### 1.3 Scoring (deterministic)

In `packages/scoring-engine`, using `finance-engine`:

1. **Eligibility filter** → `{ eligible, reason }` per card: age, occupation, income, secured cards only if `openToSecured` (or always eligible for students), fee tolerance (cards above tolerance are excluded unless "any if worth it").
2. **Value:** `netAnnualValue` for year 1 and ongoing, using the user's spend.
3. **Rank** by ongoing net value. Priorities act as a tiebreak and a small ordering boost (max ±10% of score). They **never change the ₹ figures shown**.
4. **Leakage:** best eligible card's value minus the best held card's value. Show "Your current cards leave about ₹X a year on the table". If the user holds the best card, say so.
5. Return for each card: rank, ongoing value, year-1 value, per-category breakdown (spend, rate, cap applied, ₹), fee and waiver logic, eligibility reason, and flags such as "works on UPI" and "lifetime free".

Results cache by profile hash (existing pattern). Editing one answer re-scores instantly. A new Ember explanation is generated only if the Top Pick changes (existing guardrail).

### 1.4 Ember for the recommender

Tools (all permission level 1, read/compute only):
- `getUserProfile()`
- `scoreCards()` → ranked list with breakdowns
- `getCardDetails(cardId)`
- `compareCards(cardIdA, cardIdB)` → side-by-side breakdown
- `whatIf(changes)` → re-scores with temporary answer changes, e.g. "what if I spent ₹5k on dining?" (does not save)

Explanation prompt rules:
- 2–3 sentences for the Top Pick, one line per other card.
- Only use numbers present in tool outputs.
- Mention one trade-off where it exists (e.g. "higher fee, but your spend clears the waiver").
- Plain language, no jargon without a short gloss, no urgency.

Follow-up chat: `POST /api/ember/chat` streams responses. Context for each turn is the stored profile plus the latest results, loaded through tools, not pasted in full. Store messages in `chat_messages (id, user_id, thread, role, content, created_at)`.

### 1.5 API (in `apps/web`, shared types in `packages/shared`)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Reachability |
| GET | `/api/cards` | none | Catalogue for the card picker (id, name, issuer, network, image) |
| POST | `/api/recommender/public` | none, rate-limited by IP | Score answers without saving (landing page finder) |
| PUT | `/api/recommender/profile` | user | Save quiz answers v2 |
| PATCH | `/api/recommender/profile` | user | Edit one answer |
| GET | `/api/recommender/results` | user | Ranked results + leakage (cached) |
| POST | `/api/recommender/explain` | user | SSE: narration steps then explanation |
| PATCH | `/api/arsenal/:cardId` | user | Toggle held / not held |
| POST | `/api/ember/chat` | user | Streaming chat |

Streaming on React Native: `fetch` streaming support varies, so use a library that supports SSE in RN (e.g. `react-native-sse`) or `expo/fetch` if the SDK supports streaming. If neither is reliable in Expo Go, fall back to polling `agent_runs` for steps every 500 ms. Narration must still appear step by step.

### 1.6 Mobile screens

1. **Welcome:** one line ("Get more from the cards you use"), Sign up / Sign in.
2. **Quiz:** one question per screen, large tap targets, progress, back. Q1 has search with issuer logos or initials.
3. **Ember is working:** Ember avatar (chartreuse) and steps ticking in one by one: "Checked your answers", "Filtered 40 cards to the ones you can get", "Worked out your yearly value for each", "Writing your recommendation".
4. **Results (Cards tab):**
   - Leakage banner at the top.
   - **Top Pick** card: chartreuse "Ember's pick" badge, card name, **₹/yr** large, Ember's 2–3 sentence reason, "See the math".
   - Sort tabs: Best for you / Lowest fee / Highest rewards.
   - Ranked list: name, issuer, ₹/yr, fee, one-line reason, flags (UPI, Lifetime free, FD-backed), held toggle.
   - Filters sheet: network (incl. RuPay), issuer, fee range, lifetime free only, works on UPI.
5. **Card detail sheet ("See the math"):** table of category, your spend, rate, cap, ₹ per year; fee and waiver line; year-1 vs ongoing; eligibility reason; reward notes; source link and "terms checked on" date.
6. **Ember tab:** chat, opened with the results as context. Suggested chips: "Why not {2nd card}?", "What if I travel more?", "Is the fee worth it?".
7. **Profile tab:** every answer listed, tap to edit, results refresh; arsenal list; theme; sign out.
8. **Home tab:** Top Pick summary, leakage, and a "Card Manager is coming next" card.

UX rules: dark theme default; Ember's voice is calm and specific; numbers formatted in Indian style (₹1,23,456); every ₹ figure tappable to its breakdown.

### 1.7 Web

- Landing page `/` gets a "Find your card" section: the same quiz without login, calling `/api/recommender/public`, showing the top 3 with ₹/yr and a prompt to get the app.
- Existing signed-in web pages switch to quiz v2 and the new colours. Keep them working; mobile is the priority.

### 1.8 Tests and evals

- `finance-engine`: unit tests for caps, waivers, welcome benefit (year 1 only), rounding, zero spend.
- `scoring-engine`: fixtures for (a) a student with ₹15k income sees only secured/lifetime-free cards; (b) ₹0-fee tolerance excludes all fee cards; (c) heavy food-delivery spend ranks a food co-brand first; (d) heavy UPI spend ranks a RuPay card higher; (e) a user who already holds the best card gets leakage 0; (f) priorities change order only within the ±10% band and never change ₹ values.
- `ember.eval.ts`: 10 fixtures checking that every ₹ number in the explanation appears in tool output, no banned phrases, the Top Pick named matches rank 1, and "why not X" answers reference the real card X.
- Mobile: a smoke test of the API client and the quiz reducer (Jest or Vitest).

### Step 1 acceptance

- [ ] 40 cards seeded, each with source link and checked date; unverified cards excluded from ranking.
- [ ] Quiz v2 on mobile and web; old profiles don't crash.
- [ ] Eligibility, net annual value (year 1 and ongoing) and leakage shown in ₹, matching finance-engine outputs exactly.
- [ ] Ember narration visible step by step on the phone; explanation grounded in tool data; fallback works with Gemini disabled.
- [ ] "See the math" shows the full breakdown for any card.
- [ ] Held toggle works from results and Profile and stays consistent.
- [ ] Editing one answer re-ranks without redoing the quiz.
- [ ] Follow-up chat answers "Why not {card}?" with real numbers.
- [ ] Public card finder works on the landing page without login.
- [ ] All tests and evals pass.
- [ ] Full flow works on an iPhone through Expo Go, against both the local and the deployed backend.

---

## 7. Data model summary (new or changed)

- `user_profile.answers` → v2 shape with `schemaVersion`.
- `cards` → columns in 1.2.
- `user_card_arsenal` → unchanged.
- `recommendations` → add `year1_value`, `ongoing_value`, `breakdown jsonb`, `agent default 'Ember'`.
- `agent_runs` → new (0.4).
- `chat_messages` → new or adapted from what exists (1.4).

---

## 8. Environment variables

`apps/web/.env.local`
```
DATABASE_URL=
AUTH_SECRET=
MOBILE_JWT_SECRET=          # long random string
GEMINI_API_KEY=
GEMINI_MODEL=               # pin current Flash model name
```

`apps/mobile/.env`
```
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000   # or https://<project>.vercel.app
```

Keep `.env.example` files for both with no values. Never commit real values.

---

## 9. How the founder tests on an iPhone

Write this into `docs/RUNNING.md` in plain steps:

1. Install **Expo Go** from the App Store (check its SDK version matches the project).
2. Laptop and iPhone on the same Wi-Fi.
3. `pnpm install`, then `pnpm db:migrate && pnpm db:seed-cards`.
4. Terminal 1: `pnpm dev:web` (serves on `0.0.0.0:3000`).
5. Set `EXPO_PUBLIC_API_URL` to the laptop's LAN IP.
6. Terminal 2: `pnpm dev:mobile` → a QR code appears.
7. Open the iPhone **Camera**, point at the QR, tap the banner. The app opens in Expo Go.
8. If the QR won't connect (college Wi-Fi often blocks it), run `pnpm dev:mobile -- --tunnel` instead.
9. If the app opens but can't load data, long-press the Profile title to open Diagnostics and check the API URL. Use the Vercel URL if the local one is unreachable.

---

## 10. Out of scope for this handoff

Card Manager, statement upload, nudges and push notifications, Chrome extension, "Should I buy this?" planner, Swiggy, SMS, Google sign-in, Play Store / App Store builds, payments. Do not start these. Do leave clean extension points (tool registry, permission levels, `agent_runs`, shared types).

---

## 11. Order of work and checkpoints

Commit after each:

1. Audit → `docs/AUDIT.md`
2. Monorepo restructure; web still runs; tests pass
3. Ember rename + DB migration
4. Design tokens; web restyled
5. `runEmber` + tool registry + `agent_runs` + tests
6. `finance-engine` + tests
7. Mobile auth API + Expo shell + Diagnostics → **checkpoint: QR on iPhone, sign-in works**
8. Card schema + 40-card dataset + seed + CARDS_README
9. Quiz v2 schema + mapping from v1
10. Scoring refactor (eligibility, net value, leakage) + fixtures
11. Recommender API routes
12. Ember recommender tools + explanation + chat + evals
13. Mobile quiz, narration, results, detail sheet, chat, profile, home
14. Web public finder + quiz v2 on web
15. `docs/RUNNING.md`; full acceptance pass on iPhone → **done**

If something blocks you (for example, a library won't run in Expo Go, or a card's terms can't be verified), pick the simplest option that keeps the acceptance criteria true, write the decision in `docs/DECISIONS.md`, and keep going. Ask the founder only for things you cannot decide: missing API keys, Vercel access, or a database URL.
