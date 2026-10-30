# PERQ repo audit (Step 0.1)

Audited 2026-10-31 against `docs/PERQ_Handoff_Step0_Step1.md`, at commit `33100e1`
plus the uncommitted working-tree changes listed at the end.

## 1. Folder structure

It is already a **Turborepo + pnpm** monorepo: `turbo.json`, `pnpm-workspace.yaml`
(`apps/*`, `packages/*`), pnpm 9.15.9, Node 20. There is no `.npmrc`.

```
apps/web                 Next.js 15 (App Router), Auth.js v5 beta, Tailwind 3, Vitest
packages/ai              runGeminiAgent, Gemini client, retry/model fallback, web search (Gemini grounding,
                         Firecrawl, Groq extraction)
packages/config          tsconfig.base.json only
packages/db              Drizzle schema, neon-http client, migrations (0000–0004), seed-cards script, cards.json
packages/design-tokens   tokens.css (CSS vars, old palette) + tokens.ts (var() references)
packages/fetch           fetchPage (Feature 3 precision fetch)
packages/scoring-engine  scoreCards, buildProfileFromAnswers, buckets, getBestCardForCategory, scorePaymentOptions
packages/ui              Modal, Narration, quiz widgets, Skeleton (web React)
```

Packages are consumed as raw TS source (`main: ./src/index.ts`); Next's `transpilePackages` compiles them.
The single `.env` lives at the repo root and is loaded by drizzle.config, the seed script and the eval.
It already holds `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, Google OAuth, Firecrawl and Groq keys.

Missing compared with the target: `apps/mobile`, `packages/finance-engine`, `packages/shared`, `.npmrc`,
root scripts `dev:web`, `dev:mobile`, `eval`.

## 2. Feature 1 code that exists

| Piece | Where | Notes |
|---|---|---|
| Quiz (13 Q, modal wizard + card search) | `app/(shell)/quiz/QuizWizard.tsx`, `questions.ts`, `CardSearchField.tsx` | Q1 searches DB cards, with a web fallback via `/api/quiz/card-search` |
| Quiz submit (SSE) | `app/api/quiz/submit/route.ts` | Saves profile, runs `computeAndPersistRecommendations`, streams `{type:"step"}` events |
| Results page | `app/(shell)/results/*` | Filters/sort, `ResultCard`, edit-profile panel, retake, dark toggle |
| Arsenal toggle | `app/api/arsenal/toggle/route.ts` | Upsert on `(user_id, card_id)` |
| Profile edit (re-score) | `app/api/profile/route.ts`, `lib/mimir/profileFieldSchema.ts` | PATCH one field; reuses top-pick explanation if #1 unchanged |
| Follow-up chat | `app/api/chat/route.ts`, `(shell)/mimir/MimirChatPanel.tsx` | Full reply computed, then re-chunked over SSE; 20-turn cap; `getCardDetails` tool only |
| Scoring engine | `packages/scoring-engine/src/scoreCards.ts` | gross rewards − annual fee + milestones + 10% priority boost **mixed into the score**; no caps, no waivers, no joining fee |
| `runGeminiAgent` | `packages/ai/src/runGeminiAgent.ts` | Generic loop, injected `callModel`, `MAX_TOOL_ROUNDS = 10`, `onStep` events. No zod validation, no permission levels, no run logging |
| Narration | `lib/mimir/narrationLabels.ts`, `packages/ui/narration` | Labels come from real tool-call events |
| Caching | `lib/mimir/cache.ts`, `hash.ts` | profile hash + cards version → reuse rank-1 explanation |
| Fallback explanation | `lib/mimir/explanationTemplate.ts` | Template when Gemini fails or caps out |
| Retry | `packages/ai/src/retry.ts` | 503 backoff + model chain `gemini-flash-latest → gemini-flash-lite-latest` on 429 |
| Evals | `apps/web/eval/mimir-explanations.eval.ts` + `fixtures.ts` | Live Gemini; checks ranking, a grounded number, banned phrases. Script `eval:mimir` |
| Card sourcing (D15) | `lib/mimir/resolveCardSet.ts`, `cardSearch.ts` | **Live Gemini web search is the primary card source**; seeded `cards.json` (123 unverified cards) is the fallback |

**Conflict with the handoff:** D15 (live web-searched card terms) breaks the locked rule that card
terms come from bank pages and are verified. Step 1 replaces it with the curated, verified 40-card
catalogue. `resolveCardSet`/`cardSearch` are therefore retired along with Feature 3 (see DECISIONS.md).

## 3. Database (Drizzle, Neon)

Tables: `user`, `account`, `session`, `verification_token` (Auth.js), `user_profile` (answers jsonb,
`last_card_source_mode`, `last_search_bucket_key`), `cards`, `recommendations`, `user_card_arsenal`,
`goals`, `goal_recommendations`, `chat_messages (id, user_id, role, content, created_at)`.

- `recommendations.agent` default `'MIMIR'`; `goal_recommendations.agent` default `'MIMIR'`.
- `cards` has `reward_rates` jsonb over 8 categories (dining, travel, hotels, fuel, groceries,
  ecommerce, utilities, general) as decimal fractions, `redemption_value`, `status`, `origin`
  (`seeded`/`web_search`), `search_bucket_key`, `source_urls`.
- Auth uses JWT sessions (`session.strategy = "jwt"`), Credentials (bcryptjs, cost 10) plus Google.

**`quizAnswersSchema`** (`lib/mimir/quizAnswersSchema.ts`) has **19 fields**: the 13 Feature 1 answers
(`heldCardIds, annualIncome, flightFrequency, hotelFrequency, gymMembership, foodDeliverySpend,
ecommerceSpend, grocerySpend, diningOutSpend, fuelSpend, recurringBillsByCard, feeTolerant,
priorityCategories`) plus 6 optional Feature 3 fields (`creditScoreRange, activeEmiCount,
statementDate, paymentDueDate, outstandingBalance, creditLimit`). It has no `schemaVersion`.

## 4. Feature 3 (goal advisor / Firecrawl), retired, to delete later

Leave in place, unlink from navigation:

- `apps/web/app/(shell)/goal/**`, `app/api/goals/submit/route.ts`
- `apps/web/app/(shell)/home/GoalAdvisorWidget.tsx` (linked from the home dashboard)
- `apps/web/lib/goals/**`, `apps/web/test/goals/**`
- `packages/fetch/**`
- `packages/ai/src/firecrawlSearch.ts`, `groq.ts`, `multiProvider.ts`, `webSearch.ts` (also used by D15)
- `packages/scoring-engine/src/scorePaymentOptions.ts` (+ test)
- DB tables `goals`, `goal_recommendations`
- D15 card web search: `apps/web/lib/mimir/cardSearch.ts`, `cardSearchSchema.ts`, `resolveCardSet.ts`,
  `app/api/quiz/card-search/route.ts`, `cards.origin/search_bucket_key/source_urls` columns
- Root planning docs for Feature 3: `PERQ_Feature3_PRD.md`, `PERQ_Feature3_Engineering_Plan.md`

## 5. Every "MIMIR" occurrence

307 matches across `apps/` and `packages/` (case-insensitive) at audit time.

Files/folders named after MIMIR:
- `apps/web/lib/mimir/` (15 files), `apps/web/test/mimir/` (12 tests)
- `apps/web/app/(shell)/mimir/MimirChatContext.tsx`, `MimirChatPanel.tsx`
- `apps/web/app/(shell)/AskMimirBar.tsx`, `home/AskMimirWidget.tsx`, `quiz/MimirLoadingSequence.tsx`
- `apps/web/eval/mimir-explanations.eval.ts` (+ `eval:mimir` script)
- `apps/web/public/mimir-avatar.png`, root `MIMIR_Avtar.png` (untracked)

Content (identifiers, prompts, UI copy, comments): `lib/mimir/prompt.ts` (system prompts),
`narrationLabels.ts` ("MIMIR is reading your profile"…), `computeRecommendations.ts` (`agent: "MIMIR"`),
`app/page.tsx` (landing headline), `TopBar`, `layout.tsx`, results/home/quiz components, `packages/ai`
comments, `packages/ui` Modal/Narration, `packages/scoring-engine/scorePaymentOptions.ts`,
`packages/design-tokens/tokens.css` comments, `packages/db/data/README.md`.

DB: `schema.ts` defaults on `recommendations.agent` and `goal_recommendations.agent`; migrations
`0000`, `0003` and drizzle meta snapshots (history; left as-is, a new migration changes the default).

Docs: `README.md`, `TODOS.md`, every `PERQ_*.md` planning doc, `design-reference/*.html`.

## 6. Tests

Vitest 2.1 in every package. `pnpm test` (turbo) at audit time: **6/6 tasks pass**. web has
26 files and 210 tests; ai has 23 tests; plus scoring-engine, db, ui and fetch. The Gemini eval is not
part of `pnpm test` (it needs a live key).

## 7. Uncommitted work found at audit time

Modified: Feature 3 files (`lib/goals/*` + tests), `packages/ai` (model-fallback chain in
`client.ts`/`retry.ts`/`webSearch.ts`), `home/page.tsx` (parallel queries), results Retake skeleton.
Untracked: `packages/ai/src/{firecrawlSearch,groq,multiProvider}.ts`, `home/loading.tsx`, root planning
docs and PNGs. These were committed as-is in a snapshot commit before Step 0, so later checkpoint
commits stay clean.

## 8. Retired by Step 1 (to delete later)

Superseded by Card Recommender v2 and unlinked from navigation, but left in place (with their
tests passing) so this handoff doesn't turn into a deletion sweep:

- v1 quiz/results UI: `app/(shell)/quiz/QuizWizard.tsx`, `questions.ts`, `CardSearchField.tsx`,
  `EmberLoadingSequence.tsx`, `MiniCardVisual.tsx`, `app/(shell)/results/{ResultsView,ResultCard,
  EditProfilePanel,RetakeQuizButton,filterAndSort,financialContextQuestions,...}.tsx`
- v1 routes: `/api/quiz/submit`, `/api/quiz/card-search`, `/api/profile`, `/api/profile/reset`,
  `/api/chat`, `/api/arsenal/toggle`
- v1 Ember pipeline: `apps/web/lib/ember/{computeRecommendations,cardSearch,cardSearchSchema,
  resolveCardSet,tools,prompt,narrationLabels,explanationTemplate,cache,cardMapper,...}.ts` and
  `runGeminiAgent` in `packages/ai`
- Legacy scoring: `packages/scoring-engine/src/{scoreCards,buildProfileFromAnswers,
  estimateSpendFromBucket,getBestCardForCategory}.ts`
