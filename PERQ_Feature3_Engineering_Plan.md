# PERQ — Feature 3 (Goal-Based Purchase Advisor) Engineering Plan

*Locked architecture, produced by `/plan-eng-review`. Companion to `PERQ_Feature3_PRD.md`,
`PERQ_Design_System.md`, `PERQ_Feature1_PRD.md`, and `PERQ_Feature1_Engineering_Plan.md` —
read all before writing code. This doc resolves the architecture questions the PRD (§8, §9)
deliberately left open; it does not restate anything already locked in the PRD.*

Status: Locked, outside-voice pass complete (Codex not installed on this machine — Claude
subagent used instead, see §13)
Last updated: 2026-08-16

---

## 1. Locked Architecture Decisions

### D1 — Comparison/recommendation split (PRD §9)
Mirrors Feature 1's D1 exactly, for the same reason: a new `scorePaymentOptions(channelResults,
cardArsenal, financialContext)` pure function computes, for every `{channel result} × {arsenal
card}` pair, a deterministic score from price + reward-rate value + billing-cycle float/
utilization impact. Gemini never does this arithmetic — it receives the pre-computed breakdown
via a read-only tool (mirroring `getUserProfile`/`scoreCards`) and its only job is picking the
final framing and writing the "why," grounded strictly in those numbers. Billing-cycle heuristics
(e.g. "wait N days for float," utilization-impact thresholds) must be encoded as explicit
deterministic rules, not left to model judgment — real design work at implementation time, not
a shortcut. Satisfies PRD §14's "every recommendation must trace to real, checked data."

**Category-asymmetry note (outside-voice pass, §13):** movies/attractions are a clean 1:1
comparison (the same showtime/slot, different platform — price is the whole story). Electronics
is not: an iPhone on Amazon vs. Flipkart can differ by seller, warranty terms, and bundled
variant, not just price. D5's extraction schema must capture seller/warranty/variant fields for
electronics results (already a per-channel-result schema, not a single fixed shape across
categories) so `scorePaymentOptions` can weigh them when present — but the exact weighting logic
for "is a ₹500-cheaper listing with no warranty actually the better pick" is real work deferred
to implementation, same as billing-cycle heuristics above, consistent with PRD §9's framing of
this whole engine as a goal, not an architecture.

### D2 — Channel fetching is deterministic, not model-invoked (PRD §6, §17)
Once classification (D6) resolves a category, ordinary application code — not a model tool call
— looks up the fixed 2-channel list for that category from a hardcoded const map
(`apps/web/lib/goals/channels.ts`) and fetches both, always exactly those two, no model
discretion. Gemini's tools are read-only accessors over already-fetched, already-typed results.
The channel enum is a TypeScript union, so an arbitrary channel string is a build-time type
error, not a runtime convention. This is the direct guard against PRD §17's "don't quietly
expand the channel list" warning — a model-invoked `checkChannel(channel)` tool would reopen
exactly the open-ended-discovery risk §6 was designed to close.

### D3 — Cache key & TTL design (PRD §5, §12)
`query_key` includes a date-scope component (movies/attractions always scope to the search's
"today"; electronics scope more loosely). TTL varies by category, not a single flat value:
movies/attractions ~4-6h (showtimes/availability shift same-day), electronics ~24h (prices more
stable but not static). Prevents the cross-user stale-data edge case: a date-agnostic key with a
long TTL would serve Tuesday's showtimes on Friday, or feed a stale price into a billing-cycle
"wait 3 days" recommendation computed off a price that already changed.
**Tune further once real usage exists — tracked in `TODOS.md`.**

### D4 — Retry/timeout policy, parallel fetch (PRD §7)
Both channels in a category are fetched concurrently (`Promise.allSettled`, not sequential),
each with its own hard per-channel timeout (~8s) and 1 retry with short backoff on a transient
429/503 — reusing the exact retry-backoff shape already proven in `packages/ai/src/client.ts`
(`MAX_TRANSIENT_RETRIES`/`RETRY_BASE_DELAY_MS`). One channel's failure/timeout never blocks or
delays the other. Fits the 10-30s total narration budget (PRD §10) even with a retry;
`Promise.allSettled` means a slow/dead channel degrades to the "couldn't check X" path (D5)
instead of stalling the whole search.

### D5 — Three-way failure taxonomy at the extraction layer (PRD §10, edge case ARGUMENTS #2)
`channels_checked` records one of `'failed' | 'checked_empty' | 'succeeded'` per channel, not a
binary success/failure:
- **`failed`** — Firecrawl error, timeout, or Gemini extraction throws.
- **`checked_empty`** — extraction succeeded but the channel genuinely has no listing (e.g. the
  movie isn't showing on District in that city). Not a failure — narrated differently
  ("District has no showing for this" vs. "couldn't check District right now").
- **`succeeded`** — valid structured data, passes strict zod validation.

Extraction output is validated against a strict schema (mirroring `cardSearchSchema.ts`'s
pattern from D15). **Any required field missing fails the whole channel's result** rather than
passing partial/null-patched data downstream — same "never partially nulled" discipline D15
already applies to web-searched card data. Keeps D1's scoring input trustworthy (never scores
against a guessed price).

### D6 — Classification + entity extraction staged as a separate upfront call (PRD §8)
A lightweight Gemini call (single turn, structured output, no tools) runs **before** any channel
fetching starts. It returns both the category AND category-specific structured entities in one
call — e.g. `{category:'movie', movieName, city}` | `{category:'attraction', attractionName,
city}` | `{category:'electronics', productName}` | `'unsupported'`. On `'unsupported'`, OR on a
matched category missing a required entity (e.g. no city named for a movie goal), the flow ends
immediately — zero Firecrawl calls, zero cost, honest narration ("MIMIR isn't sure this fits
movies, attractions, or electronics yet" / "MIMIR needs to know which city" as appropriate).
`goals.category` stores `'unsupported'` explicitly (queryable, distinct from "not yet
classified"), not null. Only a fully-resolved category + entity set proceeds to D2's deterministic
channel fetching and D1's scoring+narration call.

**Outside-voice correction:** the original review sections locked classification staging but
missed that classification alone (a category label) isn't enough for D2 to build a real channel
search URL — "I want to book a movie ticket" classifies as `movie` but has no movie name or city
to search BookMyShow/District with. City is not captured anywhere else (not in PRD §11's 6 new
fields, not in Feature 1's 13 quiz answers), so it must come from the goal text itself, with an
honest "needs more info" response — same pattern as an unmapped category — when it's absent
rather than guessed. Caught by the outside-voice pass (§13), not the original review sections.

**Interpretive note on "agentic" (PRD §8):** §8 requires classification via "tool-calling
reasoning, not hardcoded keyword matching," citing Feature 1 §9.2's "must be agentic, not a
single prompt" requirement. Read literally, that could be taken to require classification itself
to be a multi-turn tool-calling loop. This plan interprets §8's actual concern as **semantic
reasoning by the model, not string/regex matching** — a single structured-output Gemini call is
genuine model reasoning, not "hardcoded keyword matching," and Feature 1 §9.2's firm requirement
was specifically about the *recommendation* engine's multi-step grounding (now covered by D1's
tool-exposed score breakdown), not a mandate that every LLM-facing step in the product must
itself be a tool-calling loop. Flagging this explicitly since it's an interpretation of
ambiguous PRD language, not a restatement of a locked requirement — revisit if this reading
turns out to be wrong.

### D7 — `channel_fetch_cache` concurrency (PRD §5, edge case ARGUMENTS #3)
Unique index on `channel_fetch_cache(channel, query_key)`, written via `onConflictDoUpdate` —
the exact pattern `userProfile` already uses for its own single-row upsert
(`quiz/submit/route.ts:41-47`). A losing racer's insert becomes a harmless update instead of a
duplicate row or a constraint violation. Does not prevent the rare true-simultaneous-race double
spend (both requests fire before either cache write lands), but closes the more likely/damaging
failure mode: a duplicate-row constraint error, or two rows silently disagreeing on which is
fresh under D3's per-category TTL.

### D8 — Rate-limit enforcement, revised to 3/day (PRD §12, revised by outside-voice pass §13)
A `goals(user_id, created_at)` index backs a `COUNT` query at the **first line** of the
goal-submit route — same "first line of the handler" discipline as `requireAuth()` (2A) — checked
**before classification even runs**, so a capped-out user never triggers any spend at all, not
even a classification call. Day boundary is **UTC calendar day** (simplest, consistent, avoids
storing a per-user timezone the PRD never asks for). **Every submitted search counts toward the
cap, including a full cache hit** (a cache hit still creates a `goals` row + a fresh per-user
`goal_recommendations` row per PRD §5's "each user still gets their own personalized row"
design).

**Cap revised from PRD §12's illustrative 8/day down to 3/day.** The outside-voice pass (§13) did
the credit math the original review sections skipped: Firecrawl's free tier is 1,000
credits/month, shared platform-wide (~33/day if spread evenly). At 8 searches/user/day × 2
channels × an estimated 2-4 credits/channel (scrape + JS-render), a single active user alone
could plausibly exhaust the **entire month's** shared budget in 1-2 days — the opposite of PRD
§12's stated intent ("an unlimited single user could meaningfully dent that budget alone"). PRD
§12 itself frames 8 as "a starting point, easy to adjust," so this revision honors the PRD's
actual locked intent (bound one user's blast radius on shared quota) rather than its illustrative
number.

**T0 UPDATE (2026-08-16, real numbers):** confirmed cost is **1 credit per scrape**, not the
2-4 estimated above — a plain markdown scrape (no JS-render/extract format) is 1 credit
regardless of outcome, including a scrape that returns a blocked/error page (Amazon). Redoing the
math at the real number: 3/day/user × 2 channels × 1 credit = 6 credits/day/user, ~18% of the
~33/day shared budget for one user maxed out every day — comfortably bounded, with real headroom
to raise the cap if desired. This is a genuine open question, not silently resolved here — left
for the user to decide (raise the cap now that the real number is known, or keep 3/day and treat
the extra headroom as a safety margin against multiple concurrent active users, cache misses, and
Gemini's own separate quota, which this credit math doesn't cover at all).

**Known, accepted TOCTOU race:** the `COUNT`-then-`INSERT` shape has the same race D7 fixed for
`channel_fetch_cache` (two concurrent requests can both pass the count check before either insert
lands). Deliberately left unfixed — caught and discussed during the outside-voice pass (§13), and
judged not worth atomic-counter machinery: unlike D7's cache (wasted spend + a data-correctness
question), this race can only let a user go 1-2 searches over a cap that PRD §16 itself says has
"no UI for adjusting... revisit once real usage exists" — a soft usage guardrail, not a hard
resource or billing boundary. Effort matched to actual stakes.

**UTC-boundary UX quirk (5:30am IST reset) tracked in `TODOS.md` for a timezone-aware follow-up.**

### D9 — Narration-call fallback (inherits Feature 1's D7 pattern, PRD §12, Design System §5)
If D1's Gemini narration call itself fails/times out/exceeds the tool-round cap — distinct from
"all channels failed" (D5), this is channel data succeeding but the *explanation* step failing —
the same `buildFallbackExplanation`-style pattern from Feature 1's D7 applies: a pure function
generates grounded text directly from `scorePaymentOptions`' already-computed breakdown (e.g.
*"MIMIR recommends buying on {channel} with your {card} — it's the best combination of price and
rewards for this purchase"*), honoring Design System §5's "never a bare score" rule without an
LLM call. Not asked as a fresh decision — direct reuse of an already-proven, already-tested
pattern in this codebase, not a live design fork.

**Total-failure path (both channels fail — D5's `'failed'` on every channel in the category):**
per PRD §12, this is the *only* case that shows "MIMIR couldn't complete this search right now."
No `goal_recommendations` row is written (there's nothing to recommend); the `goals` row still
exists (it still counted against D8's cap — the search was genuinely attempted).

---

## 2. Code Quality Decisions

### 2A — `packages/fetch` stays channel-agnostic (PRD §4, §17)
`packages/fetch` exports one thing: `fetchPage(url, options)` — timeout/retry per D4, zero
awareness of "BookMyShow" or "movies" as concepts. The fixed channel list, per-channel
search-URL templates, and the category enum all live in `apps/web/lib/goals/channels.ts` —
mirroring exactly how Feature-1-specific tool definitions live in `apps/web/lib/mimir`, not
`packages/ai` (D5 in the Feature 1 plan). When Feature 2 becomes the second consumer, it needs
page-fetching for arbitrary shopping-page URLs it discovers, not a fixed channel list; a
channel-aware `packages/fetch` would carry dead weight Feature 2 has to ignore or fight.

### 2B — Financial-context fields extend `quizAnswersSchema` in place (PRD §11)
The 6 new fields (credit score range, EMI count, statement date, due date, outstanding balance,
credit limit) join the existing 13 as more keys on the same zod object in
`apps/web/lib/mimir/quizAnswersSchema.ts` (19 fields total). `apps/web/lib/mimir/
profileFieldSchema.ts` needs **zero code changes** — its field list already derives generically
from `quizAnswersSchema.shape`, so `PATCH /api/profile` immediately supports editing any of the 6
new fields with no new endpoint code. Satisfies PRD §11's "same profile-editing surface"
requirement by construction, not by convention.

---

## 3. Data Flow Diagram

### 3.1 Goal submission → classification → fetch → score → narrate → persist

```
┌──────────┐  goal_text      ┌───────────────────────┐
│  /goal   │────────────────▶│ POST /api/goals/submit │
└──────────┘                 │  (requireAuth, 2A)     │
                              └───────────┬────────────┘
                                          │
                          D8: COUNT goals WHERE user_id
                          AND created_at >= today (UTC)
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                ▼
                     >= 8 today                     < 8 today
                          │                                │
              explicit block, zero spend                  ▼
              (no goals row written)          write goals row (category=pending)
                                                            │
                                              D6: classifyGoal (single-turn,
                                              no tools) ──▶ step event:
                                                            "MIMIR is figuring out
                                                             what you mean"
                                          ┌─────────────────┴──────────────────┐
                                          ▼                                    ▼
                                   category matched                   'unsupported'
                                          │                                    │
                          update goals.category = X          update goals.category
                                          │                   = 'unsupported'; emit
                          D2: deterministic channel lookup     "MIMIR isn't sure this
                          (channels.ts, category → 2 fixed     fits movies, attractions,
                          channels, no model discretion)       or electronics yet";
                                          │                    done, stream closes
              ┌───────────────────────────┴───────────────────────────┐
              ▼ (parallel, D4)                                        ▼ (parallel, D4)
   D7: check channel_fetch_cache                          D7: check channel_fetch_cache
   (channel, query_key incl. date-scope, D3)               (channel, query_key incl. date-scope, D3)
       │                    │                                   │                    │
     HIT (fresh)          MISS/stale                          HIT (fresh)          MISS/stale
       │                    │                                   │                    │
       │         packages/fetch.fetchPage()                     │         packages/fetch.fetchPage()
       │         (D4: 8s timeout, 1 retry)                       │         (D4: 8s timeout, 1 retry)
       │                    │                                   │                    │
       │           ┌────────┴────────┐                          │           ┌────────┴────────┐
       │           ▼                 ▼                          │           ▼                 ▼
       │       fetch fails      fetch succeeds                  │       fetch fails      fetch succeeds
       │           │                 │                          │           │                 │
       │      outcome:        Gemini extraction                 │      outcome:        Gemini extraction
       │      'failed'        + zod validation (D5)              │      'failed'        + zod validation (D5)
       │                     ┌────────┼────────┐                │                     ┌────────┼────────┐
       │                     ▼        ▼         ▼                │                     ▼        ▼         ▼
       │                  invalid   empty     valid              │                  invalid   empty     valid
       │                     │        │         │                │                     │        │         │
       │                'failed' 'checked_  'succeeded'          │                'failed' 'checked_  'succeeded'
       │                 (discard)  empty'   → D7 upsert          │                 (discard)  empty'   → D7 upsert
       │                              │      channel_fetch_cache  │                              │      channel_fetch_cache
       └──────────────────┬───────────┴───────────┬──────────────┴──────────────┬───────────────┴──────┘
                           ▼                       ▼                             ▼
                    step event per channel: "MIMIR checked {channel}" / "MIMIR couldn't check {channel}"
                                          │
                          ┌───────────────┴────────────────┐
                          ▼                                 ▼
              BOTH channels 'failed'              at least one channel
              (D9 total-failure path)             'succeeded' or 'checked_empty'
                          │                                 │
          emit "MIMIR couldn't complete            2B: load arsenal (single
          this search right now"; NO               query, Perf-A-style) +
          goal_recommendations row written         financial-context fields
          (goals row already counted, D8)                    │
                          │                        D1: scorePaymentOptions()
                          │                        (deterministic — price +
                          │                         reward rate + billing-
                          │                         cycle float/utilization)
                          │                                   │
                          │                        step event: "MIMIR is
                          │                        comparing your options"
                          │                                   │
                          │                        Gemini narration call,
                          │                        tools: read-only score
                          │                        breakdown accessor
                          │                          ┌────────┴────────┐
                          │                          ▼                 ▼
                          │                      success          fail/cap (D9)
                          │                          │                 │
                          │                   step event:       buildFallback-
                          │                   "MIMIR is         Explanation
                          │                   writing your      (grounded in
                          │                   recommendation"   score breakdown)
                          │                          └────────┬────────┘
                          │                                   ▼
                          │                    write goal_recommendations row
                          │                    (recommended_channel, recommended_
                          │                    card_id, billing_cycle_note,
                          │                    explanation, channels_checked)
                          └───────────────────┬───────────────┘
                                              ▼
                                  emit "done" → stream closes
                                  client redirect → /goal/results
```

---

## 4. `packages/*` Boundaries (extends Feature 1's, PRD §4)

```
packages/
├── fetch/                                new (2A) — channel-agnostic
│   └── src/
│       ├── fetchPage.ts                  Firecrawl wrapper: url/query in,
│       │                                 clean markdown out (D4: timeout,
│       │                                 retry) — zero knowledge of
│       │                                 "channels" or "categories"
│       └── types.ts
│
├── ai/                                   unchanged boundary (D5, Feature 1) —
│   │                                     Feature 3 adds its own tool sets
│   │                                     beside Feature 1's, never inside
│   │                                     client.ts
│   └── (runGeminiAgent reused as-is for both D6's classification call
│        and D1's narration call — no new generic runner needed)
│
├── db/
│   └── schema.ts                         + goals, channel_fetch_cache
│                                          (+unique idx on channel+query_key,
│                                          D7), goal_recommendations;
│                                          quizAnswersSchema extended to 19
│                                          fields (2B) — no new table for
│                                          financial-context fields
│
└── scoring-engine/  (or a sibling package — implementation's call)
    └── scorePaymentOptions.ts            new, pure, tested (D1) — mirrors
                                           scoreCards' determinism discipline

apps/web/
├── lib/
│   └── goals/                            new — Feature-3-specific, mirrors
│       ├── channels.ts                   category → fixed 2-channel map
│       │                                 (2A) — TypeScript union, not a
│       │                                 free string
│       ├── classifyGoal.ts               D6: single-turn classification
│       ├── extractionSchema.ts           D5: strict zod schema per channel
│       │                                 result (mirrors cardSearchSchema.ts)
│       ├── cache.ts                      D7: channel_fetch_cache read/
│       │                                 upsert, D3's TTL-per-category logic
│       ├── hash.ts                       D3: computeQueryKey (date-scoped)
│       ├── rateLimit.ts                  D8: goals COUNT check
│       ├── narrationLabels.ts            new file (not a change to
│       │                                 mimir/narrationLabels.ts) — maps
│       │                                 Feature-3 tool/step names to labels
│       ├── computeGoalRecommendation.ts  orchestration: classify → fetch →
│       │                                 score → narrate → persist (mirrors
│       │                                 computeRecommendations.ts's role)
│       └── tools.ts                      read-only accessors exposed to
│                                          Gemini (D1, D2's "model reads
│                                          results, never fetches")
└── app/
    ├── goal/                             /goal — entry, results
    └── api/
        └── goals/submit/                 SSE Route Handler (D8 first,
                                           then D6, D2, D1, D9)
```

**Why this satisfies PRD §4/§17:** nothing Feature-3-specific lives in `packages/fetch` or
`packages/ai` — both stay exactly as feature-agnostic as Feature 2 will need them to be. Reuses
`runGeminiAgent` unmodified for two different call shapes (D6's single-turn classification, D1's
tool-calling narration) without adding a second generic runner.

---

## 5. Edge Cases

| Edge case | Handling |
|---|---|
| Goal doesn't map to any category | D6: honest `'unsupported'` response before any spend, not a guess (PRD §8). |
| Channel fetch hard-fails (network/timeout/429 exhausted) | D5 `'failed'`; narrated distinctly ("couldn't check X"); doesn't block the other channel (D4). |
| Channel succeeds but has no listing | D5 `'checked_empty'` — distinct from failure, narrated as "no listing found," not an error. |
| Channel returns malformed/partial data | D5: strict zod validation, any missing required field discards the whole result as `'failed'` — never partially-nulled data reaches D1's scoring. |
| Both channels fail | D9 total-failure path — explicit "couldn't complete this search," no `goal_recommendations` row, `goals` row still counts against D8's cap. |
| Concurrent identical searches (same or different users) race the same `channel_fetch_cache` key | D7 unique index + upsert — no duplicate row or constraint error; true-simultaneous double-spend is a rare, self-limiting window, not fully eliminated. |
| Stale cache served across users with different financial contexts | Structurally prevented — `channel_fetch_cache` never receives financial-context input (D2's extraction step is channel-facts-only); personalization happens only in the uncached, per-user `scorePaymentOptions`/narration step (D1). |
| 3rd search same UTC day | Succeeds normally. |
| 4th+ search same UTC day | D8: explicit block before any spend — no classification call, no `goals` row. |
| User has empty card arsenal | `scorePaymentOptions` (D1) still resolves — channel-only recommendation, no card, per Perf-A's single-query arsenal load returning an empty set gracefully rather than erroring. |
| Financial-context fields (§11) not yet filled in | `scorePaymentOptions` skips billing-cycle reasoning for missing fields rather than crashing — `billing_cycle_note` stays null. |
| Narration/explanation call fails after channel data succeeded | D9: `buildFallbackExplanation`-style template, grounded in the already-computed score breakdown — never blocks on this failure alone (distinct from the total-failure path). |
| Unauthenticated request to `/api/goals/submit` | `requireAuth()` (2A, reused as-is) redirects/401s before any data access. |
| Client navigates away mid-search (SSE stream abandoned) | Self-healing, same as Feature 1's D3 note — server-side computation isn't gated on the stream being read; `goal_recommendations` still gets computed and persisted if the pipeline completes. |

---

## 6. Test Plan

Coverage diagram (0/31 paths tested — greenfield, expected) and the regression note on
`quizAnswersSchema`'s expansion to 19 fields were produced during the interactive review; see the
conversation transcript for the full ASCII diagram. Summary:

- **Framework:** Vitest for `packages/*` and `apps/web` unit/component tests (confirmed
  installed: `apps/web/vitest.config.ts`, `packages/ui/vitest.config.ts`). **No Playwright is
  actually installed** despite Feature 1's plan recommending it — tracked in `TODOS.md`. Paths
  flagged `[→E2E]` below should target Testing-Library + Vitest component/integration tests
  (matching `QuizWizard.test.tsx`/`ResultsView.test.tsx`'s existing pattern), not an assumed
  Playwright suite.
- **Eval suite (confirmed):** `apps/web/eval/goal-recommendations.eval.ts`, mirroring
  `mimir-explanations.eval.ts`'s pattern — 5-10 synthetic fixtures across all 3 categories,
  asserting (1) classification correctly routes realistic phrasings and honestly declines
  unsupported goals, (2) narration is grounded only in `scorePaymentOptions`' actual output
  fields, (3) §13's banned-phrase list (already defined in the existing eval fixture pattern)
  holds for goal narration, (4) **at least one fixture where the cheapest raw price isn't the
  recommendation** — directly required by PRD §15's acceptance criterion.
- **Regression (CRITICAL, IRON RULE):** extending `quizAnswersSchema` to 19 fields (2B) touches
  code every existing Feature 1 test depends on
  (`quizAnswersSchema.test.ts`, `profileFieldSchema.test.ts`, `QuizWizard.test.tsx`,
  `EditProfilePanel.test.tsx`). Must verify: all 13 original fields still validate identically,
  and the quiz wizard UI doesn't suddenly render the 6 new questions (only the profile-edit panel
  should surface them, not the onboarding quiz).
- **REGRESSION RULE compliance:** flagged directly above, no AskUserQuestion needed per the
  skill's IRON RULE — this is a mandatory test requirement, not a discretionary one.

---

## 7. Performance Decisions

- **Perf-A (D9-equivalent, Feature 3):** `scorePaymentOptions` loads the full held card arsenal
  via a single join query (`user_card_arsenal JOIN cards WHERE status='held'`) before scoring
  runs — same "single query, in-memory computation" discipline as Feature 1's Perf-A. Arsenals
  are small (a handful of cards per user), so this is cheap and avoids any N+1 shape. Rejected
  alternative: reusing `getCardDetails` as a per-card tool call (Feature 1's pattern) — that
  pattern fits when a *model* chooses which cards to inspect; here deterministic code needs
  *every* held card unconditionally, so a single query is strictly better.
- **Indexing:** `channel_fetch_cache (channel, query_key)` unique index (D7);
  `goals (user_id, created_at)` index (D8's rate-limit `COUNT` query).
- **Latency budget check:** classification (~1-2s) + parallel channel fetch/extraction (~5-10s,
  bounded by the slower of 2 parallel channels, D4) + scoring (instant, deterministic) + narration
  call (~2-5s) ≈ 10-20s, fits PRD §10's 10-30s narrated budget with headroom for D4's retry.

---

## 8. NOT in Scope

| Item | Rationale |
|---|---|
| Per-goal "official site" discovery (venue/brand sites) | PRD §6, §16 — explicitly dropped from MVP, reintroduces open-ended-discovery risk. |
| Persistent goal history / dashboard | PRD §16 — explicitly deferred; no UI reads past `goal_recommendations` rows beyond the immediate result. |
| Expanding beyond 6 fixed channels / 3 categories | PRD §16 — explicitly deferred. |
| UI for adjusting the 3-goal-per-day rate limit | PRD §16 — fixed for MVP; PRD's illustrative "8" was revised down to 3 by the outside-voice pass (§13), see D8. |
| Timezone-aware rate-limit reset | Tracked in `TODOS.md` — depends on capturing user timezone, which no feature currently does. |
| TTL tuning against real usage | Tracked in `TODOS.md` — current per-category values (D3) are estimates. |
| Playwright / real E2E runner | Tracked in `TODOS.md` — cross-feature gap, not Feature 3-specific scope. |
| Automated purchase/checkout/payment | PRD §2 Non-Goal — advisory only, same as every PERQ feature. |
| A separate financial-context schema/table | 2B — extends existing `quizAnswersSchema` in place instead. |
| A channel-aware `packages/fetch` | 2A — kept channel-agnostic for Feature 2's future reuse. |

---

## 9. What Already Exists

| Sub-problem | Existing code | Reused how |
|---|---|---|
| Multi-turn tool-calling agent loop | `packages/ai/src/runGeminiAgent.ts` (D5, Feature 1) | Reused unmodified for D1's narration call — no second generic runner built. |
| Single-turn structured-output model call | `packages/ai`'s `ModelCaller`/`callModel` shape | Reused for D6's classification call (a `runGeminiAgent` invocation with zero tools, one round). |
| Transient-retry-with-backoff pattern | `packages/ai/src/client.ts` (`MAX_TRANSIENT_RETRIES`, `RETRY_BASE_DELAY_MS`) | Same shape applied to D4's Firecrawl retry policy, not reinvented. |
| Shared-cache-with-TTL, soft-delete-on-refresh pattern | `apps/web/lib/mimir/resolveCardSet.ts` + `hash.ts` (D15, Feature 1) | Direct precedent for D3/D7's `channel_fetch_cache` design — bucket key computation, freshness check, fallback-on-failure shape all reused conceptually. |
| Strict-schema-validated LLM extraction, "never partially nulled" | `apps/web/lib/mimir/cardSearchSchema.ts` (D15) | Direct precedent for D5's channel-extraction schema. |
| "MIMIR is working" narration component | `packages/ui/src/narration/Narration.tsx` (Design System §5, Feature 1) | Reused as-is — no new UI component. Only a new `apps/web/lib/goals/narrationLabels.ts` mapping file is needed (sibling to, not a change to, `mimir/narrationLabels.ts`). |
| SSE narration transport | `apps/web/app/api/quiz/submit/route.ts` (D3, Feature 1) | Direct template for `/api/goals/submit` — same `ReadableStream`/`force-dynamic` shape. |
| Single-field profile edit, generic by schema shape | `apps/web/lib/mimir/profileFieldSchema.ts` (Feature 1) | Reused with zero code changes once `quizAnswersSchema` is extended (2B). |
| Auth guard | `apps/web/lib/auth.ts` `requireAuth()`/`isAuthed()` (2A, Feature 1) | Reused as-is, first line of `/api/goals/submit`. |
| Delete-and-replace / upsert-on-conflict pattern | `userProfile`'s `onConflictDoUpdate` (`quiz/submit/route.ts:41-47`) | Direct precedent for D7's cache upsert. |
| Fallback-template-on-LLM-failure pattern | `apps/web/lib/mimir/explanationTemplate.ts` (D7, Feature 1) | Direct precedent for D9's narration-call fallback. |

Nothing above is unnecessarily rebuilt — every reuse point above is a conscious application of an
already-proven pattern in this codebase (Search Before Building, Layer 1).

---

## 10. Failure Modes

| Codepath | Failure scenario | Test? | Error handling? | User sees |
|---|---|---|---|---|
| Rate-limit check | User at/over 3 goals today (revised down from PRD §12's illustrative 8, D8) | Yes (planned) | Yes (D8, first-line block) | Explicit "you've hit today's search limit" before any spend |
| Classification call | Gemini call fails/times out | Yes (planned) | Not explicitly locked — same D9-style fallback recommended: treat as total-search failure, same UX as D9's "couldn't complete this search" | Explicit failure message, not a silent hang |
| Channel fetch | Firecrawl timeout/429 exhausted | Yes (planned, eval + unit) | Yes (D5 `'failed'`, D4 retry first) | Distinct "couldn't check {channel}" narration, other channel still shown |
| Channel extraction | Gemini returns malformed/partial data | Yes (planned) | Yes (D5, strict validation discards whole result) | Same as a channel failure — never a silently wrong price |
| Both channels fail | Total pipeline failure | Yes (planned) | Yes (D9 total-failure path) | "MIMIR couldn't complete this search right now" — never a broken/endless loading state |
| Narration call fails post-channel-success | Gemini call fails/caps out | Yes (planned, eval + unit) | Yes (D9 fallback template) | Recommendation still shown, template-worded |
| `channel_fetch_cache` write race | Two requests miss cache simultaneously | Yes (planned) | Yes (D7 unique index + upsert) | No visible difference — no duplicate rows, no crash |
| Empty card arsenal | User has no held cards | Yes (planned) | Yes (Perf-A load returns empty set gracefully) | Channel-only recommendation, no card suggested |
| Missing financial-context fields | User hasn't filled §11 fields yet | Yes (planned) | Yes (D1 skips billing-cycle note) | Recommendation shown without a billing-cycle note, not a crash |
| SSE stream abandoned mid-search | Client navigates away | Yes (planned, edge case) | Self-healing (same as Feature 1's D3) | No error; result computed and persisted regardless, just not narrated live |

**Critical gaps:** none — every failure mode above has a locked, non-silent handling path. The
classification-call-failure row's exact handling (fold into D9's total-failure UX) is a
reasonable default inherited from D9, not independently interrogated in this review — worth a
quick confirmation at implementation time, not a blocker.

---

## 11. Worktree Parallelization Strategy

| Lane | Modules touched | Depends on |
|---|---|---|
| A — Data model | `packages/db` (schema: `goals`, `channel_fetch_cache`, `goal_recommendations`, `quizAnswersSchema` extension) | — |
| B — Fetch client | `packages/fetch` (new package, D2A) | — |
| C — Scoring logic | `scorePaymentOptions` (packages/scoring-engine or sibling) | A (type shapes only) |
| D — Goal-specific AI/app logic | `apps/web/lib/goals/*` (classifyGoal, channels, extractionSchema, cache, hash, rateLimit, tools, computeGoalRecommendation) | A, B, C |
| E — App wiring | `apps/web/app/api/goals/submit`, `apps/web/app/goal/*` | A, B, C, D |
| F — Profile UI | Financial-context fields in the existing "Edit my profile" panel (2B) | A (schema extension only) |

```
Lane A: packages/db            (schema + migrations — start immediately)
Lane B: packages/fetch          (independent — Firecrawl wrapper, no dependency on A)
Lane C: scorePaymentOptions     (starts once A's type shapes are committed)
Lane D: apps/web/lib/goals      (waits on A + B + C)
Lane E: apps/web wiring         (waits on D)
Lane F: profile UI              (waits on A's schema extension only — can run parallel to B/C/D)
```

**Execution order:** Launch A, B in parallel immediately. C starts once A's type file lands. F
starts once A's `quizAnswersSchema` extension lands (independent of B/C/D entirely). D starts
once A+B+C land. E is sequenced last, fanning in from A+B+C+D.

**Conflict flags:** none — A/B/C/F touch disjoint module directories. D is the only lane fanning
in from A+B+C; E fans in from everything, sequenced last by design.

---

## 12. Implementation Tasks

- [x] **T0 — RUN, 2026-08-16, real FIRECRAWL_API_KEY** — manual spike: validate Firecrawl
  against all 6 real channels
  - Surfaced by: outside-voice pass (§13) — feasibility risk taken for granted by the original
    review sections
  - **Real credit cost: 1 credit per plain markdown scrape**, confirmed via Firecrawl's
    `/v1/team/credit-usage` endpoint before/after (1000 → 985 across 15 scrape calls). Lower than
    the 2-4 credit/channel estimate D8's 3/day cap was originally sized against — see the note on
    D8 below.
  - **bookmyshow, district: the assumed `?q=`/`?query=` search URL pattern does NOT work.**
    bookmyshow returns a soft-404 ("page unavailable"). district returns byte-identical content
    for a real movie title vs. a nonsense string — confirmed its `q` param does nothing
    server-side. Both have a real, working alternative: a city-wide "movies now showing" listing
    (`bookmyshow.com/explore/movies-{city}`, `district.in/{city}/movies`) — `channels.ts` and the
    extraction prompt were updated to use these and to scan a listing for the matching title
    rather than assume a pre-filtered result.
  - **amazon: CONFIRMED BLOCKED.** `amazon.in/s?k=...` returns HTTP 200 but the body is a
    browser-level "This site can't be reached / ERR_INVALID_RESPONSE" page — consistent across
    retries and a 3s `waitFor`. Still billed 1 credit (Firecrawl has no way to know it was
    blocked). Left in the fixed channel list per PRD §6 — D5's extraction layer correctly
    degrades this to a non-hallucinated `checked_empty`/`failed` outcome rather than a fake price,
    verified live (see below). Electronics searches will realistically show "couldn't check /
    nothing found on Amazon" most of the time until/unless a different Firecrawl configuration or
    plan tier changes this.
  - **klook, getyourguide, flipkart:** query-based search URLs work exactly as designed, real
    substantial result listings (100-500+ results for the test queries used).
  - **New finding beyond T0's original scope, surfaced by a live end-to-end run (not just the
    spike): movie listing pages show WHICH movies are playing, not ticket prices.** A live run for
    "Awarapan 2 in Mumbai" correctly classified, correctly fetched both channels, but both
    extracted `checked_empty` — the city-listing pages this fix uses don't surface per-showtime
    pricing, only movie identity; real prices live one hop deeper, on each movie's own detail/
    booking page. This is a real, load-bearing gap for the **movie category specifically**
    (verified electronics works end-to-end with a real price: Flipkart returned a live
    ₹57,749 iPhone 15 listing, narrated correctly by a real Gemini call). Attractions
    (klook/getyourguide) were not confirmed to have the same gap — their search results appeared
    to include prices inline (visible "price range" filtering, unlike the movie listings) but this
    wasn't verified with a full live extraction the way movies and electronics were.
  - Files: `apps/web/lib/goals/channels.ts` (URL patterns fixed), `apps/web/lib/goals/
    computeGoalRecommendation.ts` (extraction prompt widened for listing-style pages, truncation
    bumped 12k→30k chars), `apps/web/test/goals/channels.test.ts` (new)
  - Verify: live end-to-end run via `computeAndPersistGoalRecommendation` against the real DB/
    Firecrawl/Gemini (test-fixture user, rows cleaned up after) — classification, honest
    missing-info decline, honest no-listings-found decline, and a full success path with a real
    price and real narration text were all observed working.

- [ ] **T1 (P1, human: ~1d / CC: ~1h)** — packages/db — Schema: `goals`, `channel_fetch_cache`
  (+unique idx on channel+query_key), `goal_recommendations`; extend `quizAnswersSchema` to 19
  fields
  - Surfaced by: D3, D5, D7, D8, 2B
  - Files: `packages/db/schema.ts`, migrations, `apps/web/lib/mimir/quizAnswersSchema.ts`
  - Verify: migration applies cleanly; regression suite (§6) confirms 13 original fields unchanged

- [ ] **T2 (P1, human: ~4h / CC: ~30min)** — packages/fetch — `fetchPage(url, options)` with
  timeout + bounded retry (D4)
  - Surfaced by: D2, D4, 2A
  - Files: `packages/fetch/src/fetchPage.ts`, `types.ts`
  - Verify: unit tests with mocked Firecrawl responses (success, timeout, 429-then-success,
    retry-exhausted)

- [ ] **T3 (P1, human: ~1d / CC: ~1h)** — scoring-engine — `scorePaymentOptions()` pure function
  (D1)
  - Surfaced by: D1, Perf-A
  - Files: new module, sibling to `packages/scoring-engine`
  - Verify: unit tests (empty arsenal, missing financial-context fields, tie scores, a fixture
    where cheapest price isn't the winner)

- [ ] **T4 (P1, human: ~1d / CC: ~1h)** — apps/web/lib/goals — `channels.ts`, `classifyGoal.ts`,
  `extractionSchema.ts`, `hash.ts` (query_key), `cache.ts`
  - Surfaced by: D2, D3, D5, D6, D7
  - Files: `apps/web/lib/goals/*.ts`
  - Verify: unit tests per D5's three-way taxonomy, D7's upsert-on-conflict, D3's TTL freshness
    check

- [ ] **T5 (P1, human: ~4h / CC: ~30min)** — apps/web/lib/goals — `rateLimit.ts` (D8)
  - Surfaced by: D8
  - Files: `apps/web/lib/goals/rateLimit.ts`
  - Verify: unit tests — 3rd search same UTC day succeeds, 4th blocks before any spend, UTC
    day-boundary behavior, known-accepted TOCTOU race documented (not fixed, D8)

- [ ] **T6 (P1, human: ~1d / CC: ~1h)** — apps/web/lib/goals — `computeGoalRecommendation.ts`
  orchestration + `tools.ts` (read-only accessors) + narration fallback (D9)
  - Surfaced by: D1, D2, D9
  - Files: `apps/web/lib/goals/computeGoalRecommendation.ts`, `tools.ts`,
    `narrationLabels.ts`
  - Verify: integration test — full pipeline happy path, total-failure path, narration-fallback
    path

- [ ] **T7 (P1, human: ~1d / CC: ~1h)** — apps/web — `/api/goals/submit` SSE Route Handler
  - Surfaced by: D6, D8 (ordering), all of §3's data flow
  - Files: `apps/web/app/api/goals/submit/route.ts`
  - Verify: E2E-equivalent (Testing-Library) — full goal search → SSE narration → result;
    double-submit doesn't duplicate cache rows (D7)

- [ ] **T8 (P2, human: ~1d / CC: ~1h)** — apps/web — `/goal` entry + results pages
  - Surfaced by: PRD §13
  - Files: `apps/web/app/goal/page.tsx`, `apps/web/app/goal/results/page.tsx`
  - Verify: component tests per the coverage diagram's user-flow rows

- [ ] **T9 (P2, human: ~4h / CC: ~30min)** — apps/web — extend "Edit my profile" panel with the 6
  new fields (2B)
  - Surfaced by: 2B, PRD §11
  - Files: existing profile-edit panel component
  - Verify: regression suite confirms existing 13-field editing still works; new 6 fields editable

- [ ] **T10 (P1, human: ~1d / CC: ~1h)** — apps/web/eval — `goal-recommendations.eval.ts`
  - Surfaced by: Test review eval-scope decision
  - Files: `apps/web/eval/goal-recommendations.eval.ts`
  - Verify: fixture run against real Gemini API — classification honesty, grounding, banned-phrase
    compliance, cheapest-isn't-winner case

---

## 13. Outside Voice — Independent Plan Challenge

Codex CLI is not installed on this machine (`CODEX_MODE: not_installed`) — a fresh Claude
subagent ran the challenge instead, with no visibility into the review sections' reasoning
(independent read of the PRD, this plan, Feature 1's precedent plan, and the real schema only).

**OUTSIDE VOICE (Claude subagent) — full findings:**

1. Feasibility risk taken for granted: no spike/prototype validates Firecrawl actually works
   against Amazon/Flipkart/BookMyShow (all anti-bot-resistant, ToS-restricted per PRD §14) before
   9 tasks of pipeline infrastructure get built around the assumption that it does.
2. Firecrawl budget math never done: 8/day/user × 2 channels against a 1,000-credit/month shared
   pool means a single active user could exhaust the month's budget in ~1-2 days; the shared
   cache's real-world hit rate is likely far lower than Feature 1's card-catalog cache since
   movie/city/date queries are far more personalized.
3. Logical gap: nothing in the original D1-D9 extracted actual search entities (movie name,
   city, date; product name) from free text — D6 only classified category.
4. City/location is never captured anywhere in the profile or PRD, yet the pipeline depends on it.
5. D8's rate-limit check has the same TOCTOU race D7 explicitly fixed for the cache, left
   unfixed.
6. Electronics doesn't share movies/attractions' 1:1 comparable shape (seller/warranty/variant
   differences), built as if it did.
7. Billing-cycle heuristics remain unspecified beyond "must be explicit deterministic rules."
8. (Process note, not a content gap: flagged the plan as missing Completion Summary/Review
   Log/Dashboard sections — those run after the outside-voice pass per this skill's own
   sequencing, not a real omission.)

**CROSS-MODEL TENSION resolution (all presented individually via AskUserQuestion, user decided
each):**

- **Firecrawl budget (#2):** Accepted — D8's cap revised from PRD §12's illustrative 8/day down
  to 3/day. See D8.
- **Entity extraction + city (#3, #4):** Accepted — D6 revised to extract structured entities
  (movie name, city, product name, attraction name) in the same classification call, with an
  honest "needs more info" response when a required entity is missing. See D6.
- **Feasibility spike (#1):** Accepted — added **T0**, a manual Firecrawl validation spike against
  all 6 real channels, sequenced to run before T1-T9.
- **Rate-limit race (#5):** Rejected the fix — accepted as a known, self-correcting soft overrun
  given the guardrail's own loose stated precision (PRD §16). Documented explicitly in D8 rather
  than silently left unaddressed.
- **Electronics asymmetry (#6):** Accepted as a build-time extraction-schema requirement (seller/
  warranty/variant fields), not a new plan-level architectural decision. See D1's note.
- **Billing-cycle specificity (#7):** Not raised as a separate tension — PRD §9 already frames
  this as deferred engineering judgment at build time, same treatment Feature 1 gave its own
  formula specifics; D1 already states this requirement explicitly.
- **Process note (#8):** Not a real finding — clarified rather than adjudicated as a tension.

No unresolved cross-model disagreements remain — every substantive outside-voice finding was
either adopted (with the plan updated in place) or explicitly rejected with a stated reason, per
user decision.
