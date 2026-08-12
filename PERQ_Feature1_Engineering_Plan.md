# PERQ — Feature 1 (Card Recommender) Engineering Plan

*Locked architecture, produced by `/plan-eng-review`. This is the fourth reference doc alongside PERQ_New_Handbook.md, PERQ_Feature1_PRD.md, and PERQ_Design_System.md — read all four before writing code. This doc resolves the architecture questions the PRD (§9) deliberately left open; it does not restate anything already locked in the PRD.*

Status: Locked, pending outside-voice pass
Last updated: 2026-08-12

---

## 1. Locked Architecture Decisions

### D1 — Scoring / explanation split (PRD §9.1, §9.2)
`packages/scoring-engine` computes the full deterministic ranking as a pure, unit-testable function: `(rewardRate × categorySpend) − annualFee + milestoneBonusValue`, summed per category, no I/O. Gemini's tool-calling agent never changes the ranking — it receives the already-computed scores via tool calls and is grounded strictly in that output to write the explanation and surface trade-offs. This keeps the ranking reproducible and testable while satisfying §9.1's "reasoned, not calculated" bar through the explanation layer alone.

### D2 — Follow-up chat state (PRD §9.4)
No reliance on Gemini's own session/interaction state. A `chat_messages` table (`id, user_id, role, content, created_at` — see D11, no FK to a specific recommendation snapshot) persists raw turns. Every chat request reconstructs the full grounding context fresh from Postgres — quiz answers, derived profile, the user's LATEST recommendation snapshot, and prior chat turns — and sends it with the new turn. This survives Vercel's stateless functions naturally and keeps the "MIMIR already knows your profile" requirement testable (assert the reconstructed context, not a black-box session).

*(Noted, not adopted: Google's Interactions API, GA June 2026, offers server-side state via `previous_interaction_id`. Rejected for v1 — couples MIMIR's continuity to a ~2-month-old external API's retention guarantees instead of Postgres, and is harder to unit-test. Worth revisiting once mature.)*

### D3 — Narration transport (PRD §9.3, Design System §5)
The quiz-submit endpoint returns a raw `ReadableStream` (SSE) from a Next.js Route Handler. As each real tool call resolves server-side, the server writes a step event; the "MIMIR is working" narration component consumes real progress, not a simulated animation. Requires `export const dynamic = 'force-dynamic'` and returning the `Response` before the loop completes (buffering it defeats streaming on Vercel).

**Revised after outside-voice review:** narration is driven by actual tool-call events, not a fixed 3-step script. D1/D5's agent can call tools in any order, skip `getCardDetails` entirely, or call it multiple times across up to 10 rounds (D13) — there's no guaranteed sequence. Each SSE event fires directly off whichever tool call actually resolved (`getUserProfile` done → "MIMIR checked your profile"; `scoreCards` done → "MIMIR scored N cards"; each `getCardDetails(cardId)` resolution → generic "MIMIR is looking up {cardName}"; final text → "MIMIR is writing your recommendation"). The UI narrates what happened, not a script of what was expected to happen — this is what keeps §7's "nothing feels like background scraping" trust mechanic honest when the model's actual tool-call pattern varies run to run.

**Note:** POST-triggered SSE can't use the browser's `EventSource` (GET-only) — the client needs a `fetch()` + manual `ReadableStream` reader to consume the narration events and drive the eventual redirect to `/results`. Called out explicitly here so it's not missed as "just add EventSource" during build (implementation task T-below).

### D4 — `packages/scoring-engine` public API shape (PRD §4)
Two-layer API:
- `getBestCardForCategory(cards: Card[], category: SpendCategory): ScoredCard | null` — low-level primitive, no quiz profile needed. Feature 2 calls this directly against the user's arsenal for in-context offer advice.
- `scoreCards(profile: UserProfile, cards: Card[]): ScoredCard[]` — Feature 1's full-profile ranking, built by looping the primitive across all 8 spend categories and combining with fee/milestone math.

### D5 — `packages/ai` internal structure (PRD §4, Handbook §4/§5)
- `packages/ai/src/client.ts` — generic `runGeminiAgent({ tools, systemPrompt, history })`: the multi-turn function-calling loop (model requests call → server executes → server returns result → repeat until final text). No Feature-1 knowledge.
- `apps/web/lib/mimir/` — Feature-1-specific tool implementations (`getUserProfile`, `scoreCards` tool wrapper, `getCardDetails`), prompt templates, explanation cache, and fallback template logic. Calls the generic runner.

Feature 2/3 add their own tool sets beside Feature 1's without touching it.

### D6 — Explanation cache (PRD §9.5)
`recommendations.profile_hash` (sha256 of normalized `answers` jsonb), indexed with `(user_id, profile_hash, cards_version)` (see D10). Before calling Gemini, query for an existing row with a matching hash AND matching `cards_version`; reuse its explanation only on a full hit. Reuses the audit trail the PRD already locked (`profile_snapshot`) instead of standing up separate cache infrastructure.

### D7 — Gemini failure / quota-exhaustion fallback (PRD §9.5)
`buildFallbackExplanation(scoredCard)` — a pure function in `apps/web/lib/mimir/` — generates grounded text directly from the already-computed score breakdown (e.g. *"MIMIR recommends the {card} — it scores highest for your {topCategory} spend of ₹{amount}/month"*), honoring Design System §5's "never a bare score" rule without an LLM call. `recommendations.explanation_source` (`'gemini' | 'fallback_template'`, default `'gemini'`) makes degraded rows queryable rather than silently indistinguishable from real ones. This path is also the target of the tool-loop cap in D-Perf-B below — no separate failure mode needed.

### D8 — Tool-call execution boundary (PRD §3)
Tools execute as in-process function calls within the same Route Handler invocation — direct calls into `packages/db` and `packages/scoring-engine`, no network hop, no extra auth boundary. Matches PRD §3's explicit rationale for a single Next.js deployment ("no cross-service auth boundary to get wrong").

### D9 — Chat guardrail (post outside-voice review)
Unlike the quiz-submit path (bounded by D6's cache + D13's tool-call cap), every chat turn calls Gemini fresh with no bound. Per-session turn cap (20 turns) enforced in `/api/chat`, built into v1 scope directly (not deferred) — PRD §9.5 lists cost guardrails as things to "build into v1, not later," and chat was the gap in that list. On cap exceeded: explicit inline message ("This conversation has reached its length limit — start a fresh question from your results page") rather than a silent hard stop.

### D10 — Cache versioning against card-data changes (post outside-voice review)
D6's cache key becomes `(user_id, profile_hash, cards_version)` — `cards_version` is `max(source_updated_at)` across active cards (or a counter the seed script bumps). A seed-script run that changes any card's terms invalidates every cached explanation at once, closing the staleness gap the original `(user_id, profile_hash)`-only key left open.

### D11 — Chat continuity across profile edits (post outside-voice review)
`chat_messages.user_id` (not `recommendation_id` — no FK to a specific snapshot). D2's context-reconstruction always pulls the user's LATEST `recommendations` snapshot at request time. A profile edit mid-conversation means MIMIR's next answer reflects the updated recommendation, consistent with §11's "fresh, editable recommendations" framing — no orphaned threads, no edit-blocking.

### D12 — Profile-edit concurrency (post outside-voice review)
Last-write-wins on `user_profile.answers`, no version column or optimistic-concurrency check. This is single-user-editing-their-own-row data, not multi-party — a lost intermediate write just means the final persisted state reflects the user's last click, which matches their own expectation. Explicit conflict-detection machinery would be over-engineered relative to the actual risk (a race window measured in milliseconds, self-correcting on next fetch).

### D13 — Tool-call round cap, revised (supersedes original Perf-B value)
`MAX_TOOL_ROUNDS = 10` (raised from the original 6), defined as a named constant in `packages/ai` with a comment explaining the budget: `getUserProfile` + `scoreCards` + up to ~3 `getCardDetails` calls (comparing trade-offs across top-ranked cards per §9.1) + buffer. The original 6-round figure was sized as a round number, not against this usage pattern — normal, non-pathological requests could plausibly need 4-5 rounds before the explanation turn, which left too little headroom before hitting the fallback path (D7) on ordinary usage rather than genuine failures. Tune further once real Gemini usage logs exist (noted for later, not a blocker).

### D14 — Recommendations write is delete-and-replace, not blind insert (post-review gap)
Every quiz-submit and every profile-edit re-score deletes the user's existing `recommendations` rows and inserts the fresh set inside the same transaction, rather than blind-inserting. Makes "the user's current recommendations" unambiguous — exactly one active set per user at all times — and makes a double-click/double-submit idempotent instead of accumulating duplicate/stale rows silently. Per-row auditability (`profile_snapshot`) is preserved; a full historical log of every past recommendation set is not — the PRD doesn't ask for one.

---

## 2. Code Quality Decisions

- **2A — Auth DRY:** a single `requireAuth()` helper (`apps/web/lib/auth.ts`) is the first call in every Feature-1 route handler/Server Action (`quiz/submit`, `profile` edit, `chat`, `arsenal/toggle`).
- **2B — Spend-bucket mapping DRY:** `estimateSpendFromBucket(bucket)` lives in `packages/scoring-engine` beside `scoreCards`/`getBestCardForCategory` — one implementation, shared by initial scoring and every profile-edit re-score.
- **2C — Card deprecation:** `cards.status` (`'active' | 'discontinued'`, default `'active'`). The seed script marks source-missing cards `'discontinued'` instead of hard-deleting; scoring/results queries filter `status = 'active'`; arsenal/recommendation history keeps rendering against discontinued cards instead of hitting a dangling reference.
- **2D — Re-score failure handling:** on a profile-edit re-score failure, show an inline error near the edited field and keep the last-known results/answer visible client-side until the server confirms the write — never a silent stale state.

---

## 3. Data Flow Diagrams

### 3.1 Quiz submission → results render

```
┌─────────┐   13 answers    ┌──────────────────────┐
│  /quiz  │ ───────────────▶│ POST /api/quiz/submit │
└─────────┘                 │  (requireAuth, 2A)    │
                             └──────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                                        │
          validate 13 answers                                │  SSE stream
          write user_profile.answers                         │  opens (D3)
                    │                                         │  export const
                    ▼                                         │  dynamic =
     ┌─────────────────────────────┐   step event:            │  'force-dynamic'
     │ packages/scoring-engine     │──▶"MIMIR checked your     │
     │ estimateSpendFromBucket(2B) │   profile" ───────────────┤
     │ scoreCards(profile, cards)  │                           │
     │  (active cards only, 2C)    │──▶ step event:             │
     └──────────────┬──────────────┘   "MIMIR scored N cards"─┤
                     │ ScoredCard[]                            │
                     ▼                                         │
     ┌─────────────────────────────────────┐                  │
     │ apps/web/lib/mimir                   │                  │
     │  check profile_hash cache (D6)       │                  │
     │  ├─ HIT  → reuse cached explanation  │                  │
     │  └─ MISS ▼                           │                  │
     │     runGeminiAgent (D5, packages/ai) │──▶ step event:    │
     │      tools: getUserProfile,           │   "MIMIR is       │
     │      getCardDetails (D8, in-process)  │    writing your   │
     │      cap: 6 tool-call rounds          │    recommendation"┤
     │      (Perf-B)                         │                  │
     │     ├─ success → explanation text     │                  │
     │     └─ fail/quota/cap-exceeded (D7)  │                  │
     │        → buildFallbackExplanation     │                  │
     └──────────────────┬────────────────────┘                 │
                         ▼                                      │
        write recommendations rows                              │
        (rank, score, explanation,                               │
         explanation_source, profile_hash,                       │
         profile_snapshot)                                       │
                         │                                       ▼
                         │                          step event: "done" → stream closes
                         ▼
              client redirect → /results
              (single fetch of active cards +
               recommendations, in-memory
               filter/sort, Perf-A)
```

### 3.2 Returning-user edit-one-answer → re-score → conditional re-explanation (PRD §11, §9.5)

```
┌───────────────────┐  edit 1 answer   ┌────────────────────────┐
│ /results           │─────────────────▶│ PATCH /api/profile      │
│ "Edit my profile"  │                  │  (requireAuth, 2A)      │
└───────────────────┘                  └───────────┬─────────────┘
                                                     │
                                       update user_profile.answers
                                                     │
                                                     ▼
                                    scoreCards(newProfile, activeCards)
                                       (cheap, synchronous — no
                                        loading state per §11)
                                                     │
                                        ┌────────────┴────────────┐
                                        │                         │
                                        ▼                         ▼
                              write FAILS (2D)          write SUCCEEDS
                                        │                         │
                              inline error shown          compare new #1
                              near edited field;           card vs old #1
                              keep prior results +                │
                              answer visible               ┌──────┴──────┐
                                                            ▼             ▼
                                                      #1 SAME        #1 CHANGED
                                                            │             │
                                                   keep cached      check profile_hash
                                                   explanation      cache (D6)
                                                   (no Gemini call) ┌──────┴──────┐
                                                            │       ▼             ▼
                                                            │     HIT           MISS
                                                            │  reuse cached   new Gemini
                                                            │  explanation    call (D7 on
                                                            │       │         failure)
                                                            └───────┴─────────────┘
                                                                    ▼
                                                        results re-render, ranked
                                                        list order updated
                                                        immediately either way
```

---

## 4. `packages/*` Boundaries (PRD §4 — hard requirement for Feature 2/3 reuse)

```
packages/
├── scoring-engine/
│   ├── src/
│   │   ├── estimateSpendFromBucket.ts   pure, tested (2B)
│   │   ├── getBestCardForCategory.ts    pure, tested — Feature 2 reuse point (D4)
│   │   ├── scoreCards.ts                pure, tested — Feature 1 entry point (D4)
│   │   └── types.ts                     UserProfile, Card, ScoredCard, SpendCategory
│   └── (no DB access, no I/O — callers pass data in)
│
├── ai/
│   ├── src/
│   │   ├── client.ts                    runGeminiAgent — generic loop (D5)
│   │   └── types.ts                     Tool, AgentResult — no Feature-1 types here
│   └── (Feature 2/3 add their own tool sets alongside Feature 1's,
│        never inside client.ts)
│
├── db/
│   ├── schema.ts                        users, user_profile, cards (+status, 2C,
│   │                                     +source_updated_at feeds cards_version D10),
│   │                                     recommendations (+profile_hash D6,
│   │                                     +cards_version D10, +explanation_source D7),
│   │                                     user_card_arsenal, chat_messages
│   │                                     (D2, keyed to user_id per D11, not a
│   │                                     specific recommendation snapshot)
│   └── scripts/seed-cards.ts            upsert + soft-delete missing cards (2C)
│
└── ui/
    └── (shadcn/ui-themed; "MIMIR is working" narration component
         built once here per Design System §5, consumed by D3's SSE stream)

apps/web/
├── lib/
│   ├── auth.ts                          requireAuth() (2A)
│   └── mimir/                           Feature-1-specific: tool implementations,
│                                        prompt templates, cache lookup (D6),
│                                        fallback template (D7)
└── app/
    ├── quiz/                            /quiz — modal wizard
    ├── results/                         /results — filters, sort, hero, list, chat
    └── api/
        ├── quiz/submit/                 SSE Route Handler (D3)
        ├── profile/                     edit → re-score (§11)
        ├── chat/                        follow-up (D2)
        └── arsenal/toggle/               shared mutation (§12)
```

**Why this satisfies PRD §4:** Feature 2 reuses `getBestCardForCategory` directly (no quiz-profile dependency) and `runGeminiAgent` with its own tool set (page-extraction tools instead of `getUserProfile`/`scoreCards`). Feature 3 reuses both plus `runGeminiAgent` again for its category-mapped channel extraction (Handbook §5: "reused, not rebuilt"). Nothing Feature-1-specific (prompts, cache, fallback templates) lives inside `packages/scoring-engine` or `packages/ai` — it's all in `apps/web/lib/mimir/`, so Feature 2/3 never have to pick Feature-1 code out of a shared package.

---

## 5. Edge Cases

| Edge case | Handling |
|---|---|
| Gemini call fails / quota exhausted | `buildFallbackExplanation` (D7); `explanation_source='fallback_template'`; ranked list still ships — never blocks (§9.5). |
| Agent loop exceeds 6 tool-call rounds | Same fallback path as an outright failure (D7 + Perf-B). |
| Profile edit, #1 card unchanged | No Gemini call; cached explanation reused (§9.5). |
| Profile edit, #1 card changed | Cache-check (D6) → Gemini call only on a genuine miss. |
| Profile edit write fails | Inline error, prior state preserved (2D). |
| First-time user, empty arsenal | Quiz Q1 "I don't have any yet"; arsenal-dependent UI (e.g. "show cards I hold" filter) reflects zero state, not an error. |
| Returning user, populated profile | Skip quiz entirely, results computed from last saved `answers` (§11). |
| Card discontinued after being held/recommended | Soft-delete (2C) — history keeps rendering, doesn't 500 on a dangling FK. |
| Unauthenticated request to any Feature-1 route | `requireAuth()` (2A) redirects/401s before any data access. |
| Chat question about a card outside the top-N shown | `getCardDetails` tool available mid-conversation, not just at initial scoring. |
| Gemini call fails mid-chat / quota exhausted | Inline chat error, failed turn NOT persisted to `chat_messages`, user can retry (post outside-voice finding). |
| Card data updated after an explanation was cached | `cards_version` in the cache key (D10) invalidates stale cached explanations on the next request. |
| Profile edited while a chat conversation is open | Chat stays tied to the user, not a frozen snapshot (D11) — next answer reflects the updated recommendation. |
| Two profile-edit requests race (double-edit, two tabs) | Last-write-wins, no locking (D12) — acceptable for single-user-own-data. |
| Chat conversation exceeds 20 turns | Explicit cap message, guardrail against unbounded per-turn Gemini cost (D9). |

---

## 6. Test Plan

Full codepath trace, coverage diagram, and the eval-suite decision for MIMIR's two LLM-facing prompts are in the companion test-plan artifact:
`~/.gstack/projects/PERQ/sarthakatrish-no-branch-eng-review-test-plan-20260812-050944.md`
(consumed directly by `/qa` and `/qa-only`).

**Recommended test stack** (not PRD-locked — a plan-level default): **Vitest** for `packages/*` unit tests, **Playwright** for `apps/web` E2E.

**Eval suite (confirmed):** grounding + specificity fixtures (5–10 synthetic profiles through the real scoring engine) asserting (1) no hallucinated card facts in explanations, (2) chat answers reference the actual ranked card for that profile, (3) no urgency/scarcity language (§13 compliance).

Coverage summary: 47 planned paths (31 code, 16 user flows), 7 flagged `[→E2E]`, 4 flagged `[→EVAL]`. Zero existing coverage (greenfield) — expected, not a gap to be alarmed by.

---

## 7. Performance Decisions

- **Perf-A:** `/results` fetches all active cards + the user's recommendations in one query each; filters and sort tabs operate in-memory on that set (§10's explicit "not separate queries," trivial at ~120 rows).
- **Perf-B (superseded by D13):** `runGeminiAgent` enforces a hard cap of tool-call rounds (raised to 10, see D13); exceeding it triggers the same fallback path as an outright Gemini failure (D7), bounding both latency and free-tier quota burn per §9.5's cost-guardrail intent.
- **Perf-C (new, D9):** Chat enforces a 20-turn per-session cap — the larger, previously-unbounded quota risk identified in the outside-voice pass.
- **Indexing:** `recommendations (user_id, profile_hash, cards_version)` indexed for the D6/D10 cache lookup.

---

## 8. NOT in Scope

| Item | Rationale |
|---|---|
| Redis/KV cache infrastructure | D6/D10 — a Postgres column comparison is sufficient at ~120-card, per-user scale; no separate cache service needed. |
| Internal HTTP API routes for tool execution | D8 — in-process calls only; PRD §3's own rationale for a single Next.js deployment. |
| Gemini Interactions API for chat state | D2 — rejected for v1 (API is ~2 months old, unproven retention); tracked in `TODOS.md` to revisit. |
| Rate limiting on `/api/quiz/submit` | Tracked in `TODOS.md`; chat's guardrail (D9) was pulled in-scope, quiz-submit's was not — lower risk, already bounded by D6 cache + D13 cap. |
| Backfill script, `fallback_template` → real explanation | Tracked in `TODOS.md` — quality upgrade, not a correctness fix; D7's `explanation_source` column already supports adding this later. |
| Admin panel for card data | PRD §2 Non-Goal — script-only maintenance (§7). |
| Push notifications / email | PRD §2 Non-Goal — single-session onboarding flow, not an engagement loop. |
| Account Aggregator / bank linking | PRD §2 Non-Goal — all data self-reported. |
| Payment processing / card application flow | PRD §2 Non-Goal — advisory only. |
| Optimistic concurrency / locking on profile edits | D12 — last-write-wins is sufficient for single-user-own-data; explicit locking would be over-engineered relative to the actual risk. |
| Illustration/iconography, motion/animation, logo/wordmark | PRD §15 — explicitly deferred to build time. |
| Exact Gemini model identifier / free-tier quota numbers | PRD §15 — confirm in Google AI Studio at implementation time, don't hardcode a number that goes stale. |
| OAuth provider choice beyond email/password default | PRD §15. |
| Preferred card network as a quiz question | PRD §8 — explicitly handled as a results-page filter instead of a spend-pattern signal. |
| Sourcing/compiling the 100–120 real card dataset | Real research/content work (PRD §7), not engineering — sequenced as its own parallel lane in §11 below, not bundled into this engineering plan's task list. |

## 9. What Already Exists

Nothing. Confirmed in Step 0 before this review began: no `apps/`, no `packages/`, no prior PERQ codebase on disk. The three source docs (`PERQ_New_Handbook.md`, `PERQ_Feature1_PRD.md`, `PERQ_Design_System.md`) and this plan are the only artifacts that exist before build starts. This is a fully greenfield build — every item in §1–§7 above is new work, not a reuse decision.

## 10. Failure Modes

| Codepath | Failure scenario | Test? | Error handling? | User sees |
|---|---|---|---|---|
| Gemini explanation call (initial) | Timeout / network / quota exhausted | Yes (eval + unit) | Yes (D7 fallback template) | Ranked list + template explanation, never blocked |
| Gemini chat call | Timeout / network / quota mid-conversation | Yes (planned) | Yes (post-review: inline error, turn not persisted) | Explicit retry prompt, no silent hang |
| Tool-loop exceeds cap | Agent needs >10 rounds (D13) | Yes (adjacent unit coverage) | Yes (same fallback as D7) | Fallback explanation — visually identical to any other Gemini-unavailable case |
| Profile-edit re-score write fails | DB write error / network blip | Yes (planned) | Yes (2D inline error, prior state kept) | Inline error near the edited field |
| Card discontinued while referenced | Seed-script refresh removes a held/recommended card | Yes (planned) | Yes (2C soft-delete + status filter) | Card still renders, no crash |
| Quiz double-submit / double-click | Two submits for the same profile | Yes (planned) | Yes (D14 delete-and-replace, idempotent) | No visible difference — no duplicate rows created |
| SSE stream interrupted (client navigates away mid-submit) | Client closes tab during narration | Yes (planned, edge case) | Self-healing — the Route Handler's server-side computation isn't gated on the stream being read; recommendations still get computed and persisted. User just loses the live narration and sees results on next visit. | No error, no data loss — narration simply doesn't finish rendering |
| Chat conversation exceeds 20 turns | Long-running follow-up session | Not yet in test diagram — **add to test plan before build** | Yes (D9 explicit cap message) | Clear "start a fresh question" message |

**Critical gaps:** none. Every failure mode above has both test coverage planned and explicit (non-silent) error handling — the one item flagged above ("chat exceeds 20 turns") needs to be added to the Playwright/unit test list at build time but the *behavior* itself is already decided (D9), so it's a test-coverage note, not an open design gap.

## 11. Worktree Parallelization Strategy

| Lane | Modules touched | Depends on |
|---|---|---|
| A — Data model | `packages/db` (schema, Drizzle migrations) | — |
| B — Scoring logic | `packages/scoring-engine` | A (type shapes only — see note below) |
| C — AI runner | `packages/ai` | — |
| D — UI primitives | `packages/ui`, `packages/design-tokens` | — |
| E — Card dataset | Card research/compilation → `packages/db/scripts` seed input | — (real critical path, longest pole) |
| F — App wiring | `apps/web` (quiz, results, chat, arsenal routes) | A, B, C, D |

**Design note (avoids an A↔B circular dependency):** per D4, `packages/scoring-engine` is pure with zero I/O — it should own its own domain types (`Card`, `UserProfile`, `ScoredCard`) independently of Drizzle's generated types, not import them from `packages/db`. `packages/db` maps its Drizzle rows to/from these types at the boundary. This lets Lane B start from a short, hand-written type file committed early in Lane A, without waiting on the full schema/migration work to land.

**Parallel lanes:**
```
Lane A: packages/db            (schema + migrations)
Lane B: packages/scoring-engine (starts once A's type shapes are committed — not full migration)
Lane C: packages/ai            (independent)
Lane D: packages/ui            (independent)
Lane E: card dataset research  (independent — real content work, start immediately, likely longest pole)
Lane F: apps/web wiring        (waits on A + B + C + D; can build against fixture/seed data
                                 before E lands, swap to real data once E completes)
```

**Execution order:** Launch A, C, D, E in parallel immediately. B starts as soon as A's type file is committed (within the same day, not gated on the full migration). F starts once A+B+C+D land — build and test against a small fixture card set first, don't block F on E's full 100–120-card research being complete.

**Conflict flags:** none — A/B/C/D/E touch disjoint module directories. F is the only lane that fans in from all others, sequenced last by design, not by accident.

## 12. Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1d / CC: ~1h)** — packages/db — Schema: `users, user_profile, cards(+status,+source_updated_at), recommendations(+profile_hash,+cards_version,+explanation_source), user_card_arsenal, chat_messages(user_id-keyed)`
  - Surfaced by: D2, D6, D10, D11, 2C, D7
  - Files: `packages/db/schema.ts`, migrations
  - Verify: migration applies cleanly; unique/index constraints match D6/D10's `(user_id, profile_hash, cards_version)`
- [ ] **T2 (P1, human: ~1d / CC: ~1h)** — packages/scoring-engine — `estimateSpendFromBucket`, `getBestCardForCategory`, `scoreCards`, own domain types
  - Surfaced by: D4, 2B, worktree design note
  - Files: `packages/scoring-engine/src/*.ts`
  - Verify: unit tests per test-plan artifact (empty cards[], tie scores, missing answer, unknown bucket)
- [ ] **T3 (P1, human: ~1d / CC: ~1h)** — packages/ai — `runGeminiAgent` generic tool-calling loop with `MAX_TOOL_ROUNDS=10`
  - Surfaced by: D5, D13
  - Files: `packages/ai/src/client.ts`
  - Verify: unit tests with mocked tool responses (single call, multiple calls in one turn, tool throws, cap exceeded)
- [ ] **T4 (P1, human: ~4h / CC: ~30min)** — packages/ui — "MIMIR is working" narration component (event-driven, per revised D3)
  - Surfaced by: D3 (revised), Design System §5
  - Files: `packages/ui/src/narration/*`
  - Verify: renders arbitrary event sequences, not just a fixed 3-step script
- [ ] **T5 (P1, human: ~1d / CC: ~1h)** — apps/web — `requireAuth()` helper, applied to all Feature-1 routes
  - Surfaced by: 2A
  - Files: `apps/web/lib/auth.ts`, all `app/api/*` routes
  - Verify: unauthenticated request to each route → 401/redirect
- [ ] **T6 (P1, human: ~2d / CC: ~2h)** — apps/web — `/api/quiz/submit` SSE Route Handler: validate → write profile → score → agent loop → delete-and-replace recommendations (D14)
  - Surfaced by: D1, D3, D8, D14
  - Files: `apps/web/app/api/quiz/submit/route.ts`, `apps/web/lib/mimir/*`
  - Verify: E2E — full quiz → SSE narration → results; double-submit produces no duplicate rows
- [ ] **T7 (P1, human: ~1d / CC: ~1h)** — apps/web/lib/mimir — `buildFallbackExplanation`, `explanation_source` write, cache lookup (D6/D10)
  - Surfaced by: D6, D7, D10
  - Files: `apps/web/lib/mimir/fallback.ts`, `apps/web/lib/mimir/cache.ts`
  - Verify: cache hit/miss on hash+version combinations; fallback text cites real score-breakdown fields
- [ ] **T8 (P1, human: ~1d / CC: ~1h)** — apps/web — `/api/profile` edit → re-score → conditional re-explanation, last-write-wins (D12), inline error on failure (2D)
  - Surfaced by: §11, D12, 2D
  - Files: `apps/web/app/api/profile/route.ts`
  - Verify: #1-unchanged skips Gemini; #1-changed triggers cache-check then call; write failure shows inline error, preserves prior state
- [ ] **T9 (P1, human: ~1d / CC: ~1h)** — apps/web — `/api/chat`: reconstruct context from Postgres (D2), user-keyed continuity (D11), 20-turn cap (D9), non-persisted failed turns
  - Surfaced by: D2, D9, D11
  - Files: `apps/web/app/api/chat/route.ts`
  - Verify: eval suite (grounding + specificity); reload mid-chat retains context; cap message at turn 21
- [ ] **T10 (P2, human: ~4h / CC: ~30min)** — apps/web — `/api/arsenal/toggle`, shared mutation from quiz Q1 and results page
  - Surfaced by: §12
  - Files: `apps/web/app/api/arsenal/toggle/route.ts`
  - Verify: both entry points converge on identical state
- [ ] **T11 (P2, human: ~1d / CC: ~1h)** — apps/web — `/results` single-fetch + in-memory filter/sort (Perf-A)
  - Surfaced by: Perf-A, §10
  - Files: `apps/web/app/results/page.tsx`
  - Verify: filter/sort tab interactions don't trigger new network requests
- [ ] **T12 (P2, human: ~4h / CC: ~30min)** — packages/db/scripts — seed-cards script with soft-delete (2C) and `source_updated_at`/`cards_version` bump
  - Surfaced by: 2C, D10
  - Files: `packages/db/scripts/seed-cards.ts`
  - Verify: re-running against source data missing a previously-seeded card marks it `discontinued`, doesn't hard-delete
- [ ] **T13 (P2, human: ~4h / CC: ~30min)** — apps/web — client-side `fetch()` + `ReadableStream` reader for the POST-triggered SSE narration (no `EventSource`)
  - Surfaced by: D3 note (outside-voice finding)
  - Files: `apps/web/app/quiz/*`
  - Verify: narration renders live during a real quiz submission, redirect fires on stream completion
- [ ] **T14 (P3, human: ~2h / CC: ~15min)** — Eval suite: grounding + specificity fixtures (5–10 synthetic profiles)
  - Surfaced by: Test review, eval-scope decision
  - Files: `apps/web/eval/mimir-explanations.eval.ts`
  - Verify: no hallucinated card facts; chat answers reference the actual ranked card; no urgency/scarcity language

---

## 13. Completion Summary

- Step 0: Scope Challenge — scope accepted as-is (the two PRD-mandated open decisions plus §4's reuse contract, no reduction needed)
- Architecture Review: 8 issues found (D1–D8)
- Code Quality Review: 4 issues found (2A–2D)
- Test Review: diagram produced, 47 planned paths (31 code, 16 user flows), 7 flagged E2E, 4 flagged eval; eval scope confirmed
- Performance Review: 2 issues found (Perf-A, Perf-B→revised as D13)
- Outside voice: ran (Claude subagent — Codex CLI not installed) — 10 findings; 3 cross-model tensions resolved (D1/D5 kept per PRD §9.2 re-read, D9 chat guardrail pulled in-scope, D3 narration made event-driven); 4 further new gaps resolved (D10, D11, D12, D13-revision) plus 1 gap found during synthesis (D14)
- NOT in scope: written (§8)
- What already exists: written (§9) — nothing, fully greenfield
- TODOS.md updates: 3 items proposed, 3 accepted (quiz-submit rate limiting, fallback-explanation backfill script, Interactions API revisit)
- Failure modes: 0 critical gaps flagged (§10) — every failure mode has planned test coverage and non-silent error handling
- Outside voice: ran (codex/claude) → claude subagent (Codex not installed)
- Parallelization: 6 lanes (§11), 5 parallel (A, C, D, E, and B shortly after A) / 1 sequential (F fans in last)
- Lake Score: 27/27 decisions chose the recommended/complete option

## 14. Design Review Decisions (`/plan-design-review`)

*No `DESIGN.md` exists; `PERQ_Design_System.md` served as its equivalent (locked tokens/type/spacing/voice/component conventions), per the PRD's own framing. Visual mockup generation was unavailable (gstack designer binary present, no OpenAI API key configured) — this pass is text-spec-only, same rigor, no rendered images. Classifier: **App UI** (quiz form, data-dense results/filters, chat tool — task-focused, not marketing/landing).*

**Scores:** Info Architecture 6→9/10 · Interaction States 3→8/10 · User Journey 5→8/10 · AI Slop Risk 7→9/10 · Design System Alignment 6→9/10 · Responsive & Accessibility 2→8/10 · Unresolved Decisions: 0. **Overall: 4.7→8.5/10.**

### DR1 — Quiz input widget mapping (Pass 1)
Four reusable widget types cover all 13 questions, built once each in `packages/ui`:

| Widget | Questions |
|---|---|
| `searchable-multi-select` | Q1 (held cards) |
| `single-select-scale` (4-point) | Q2, Q3, Q4, Q6–Q10, Q12 |
| `pick-up-to-N-chips` | Q13 (max 2 of 6 tags) |
| `yes-no-with-conditional` | Q5 (gym + amount), Q11 |

### DR2 — Fallback-explanation visual parity (Pass 2)
The D7 fallback-template explanation renders identically to a real MIMIR explanation — no user-facing "degraded" marker. `explanation_source` stays a backend-only field (already decided in D7); this confirms it has no UI surface.

### DR3 — Empty arsenal state (Pass 2)
First-time users with no held cards: the "show cards I hold" filter stays visible but disabled, with helper text ("Add a card from your results below to start building your arsenal") rather than being hidden.

### DR4 — Zero filter-results state (Pass 2)
Filtering to 0 matching cards replaces the list area with "No cards match these filters" + a one-click "Clear filters" action; sidebar/drawer filters stay visible and editable.

### DR5 — Narration pacing floor (Pass 3)
Each narration step (event-driven per D3) holds on screen for a minimum ~400ms before advancing, even when the underlying tool call resolved faster (cache hit, fast Gemini response) — every step shown still corresponds to a real event; this only adds a display-time floor, not fake steps.

### DR6 — Ranked-list row differentiation (Pass 4)
Rows for cards already in the user's arsenal use `--bg-surface` instead of `--bg-base` — a subtle background/border distinction using only already-locked tokens, no new decoration, so a 15–20 row list scans instead of blurring together.

### DR7 — Chat visual identity (Pass 5)
User messages: simple `--bg-surface` bubble, right-aligned (standard convention). MIMIR's responses: unboxed text with a small "MIMIR" label set in the display font (Cabinet Grotesk) above each response, `--accent` used sparingly on the label only — reads as advice spoken directly, not a boxed chatbot reply, consistent with the brand tension (§1: wisdom + Gen-Z voice, never a bank, never generic bubble-chat).

### DR8 — Mobile filters (Pass 6)
Below a 768px breakpoint, the filters sidebar becomes a "Filters" button opening a bottom sheet/drawer (~80% viewport height); sort tabs stay visible above the list. Keeps MIMIR's Top Pick hero and the ranked list — the actual payoff — above the fold on mobile, where most of the target user base (Gen Z India) will land.

### DR9 — Narration accessibility (Pass 6)
The narration container is an `aria-live="polite"` region; each step event updates its text content so screen-reader users hear "MIMIR checked your profile," "MIMIR scored N cards," etc. as they happen — the "show the work" trust mechanic (Handbook §7) is otherwise completely invisible to screen-reader users.

### DR10 — Quiz keyboard contract (Pass 6)
Each question's primary input auto-focuses on screen entry. Enter advances (where valid — single-select/scale questions); Escape/Alt+Left goes back; all controls are reachable via Tab in visual order; focus moves to the new question's input after navigation. 44px minimum touch targets on mobile.

### Pass 7 — Unresolved Design Decisions
None remaining — all 9 findings across Passes 1–6 were resolved directly into DR1–DR10 above, none deferred.

### NOT in Scope (design)
| Item | Rationale |
|---|---|
| Illustration/iconography style, motion/animation conventions, logo/wordmark | PRD §15 / Design System §7 — explicitly deferred to build time, not this review's concern. |
| Visual mockup rendering | Designer binary present but no API key configured this session — text specs (DR1–DR10) substitute; see note above. |
| Empty-state illustration/mascot art | DR3 uses copy only, consistent with PRD §15 deferring illustration style. |

### What Already Exists (design)
`PERQ_Design_System.md` — locked color tokens (primitives + semantic light/dark), type scale (Cabinet Grotesk display + Inter/Geist body), spacing/radius/elevation scale, component conventions (shadcn/ui base, narration component named explicitly), and voice/tone rules. All 10 decisions above (DR1–DR10) build strictly on these locked tokens — no new colors, fonts, or spacing values introduced.

### TODOS.md updates (design)
None — all findings from this review were resolved directly into the plan (DR1–DR10), nothing deferred as design debt.

### Design Implementation Tasks
- [ ] **T15 (P1, human: ~1d / CC: ~1h)** — packages/ui — 4 reusable quiz widget types (DR1)
  - Surfaced by: Pass 1
  - Files: `packages/ui/src/quiz-widgets/*`
  - Verify: all 13 questions render from exactly one of the 4 widget types
- [ ] **T16 (P2, human: ~4h / CC: ~30min)** — apps/web — Empty arsenal + zero-filter-results states (DR3, DR4)
  - Surfaced by: Pass 2
  - Files: `apps/web/app/results/*`
  - Verify: disabled filter with helper text when arsenal empty; clear-filters action at 0 results
- [ ] **T17 (P2, human: ~2h / CC: ~15min)** — apps/web — Narration pacing floor + aria-live region (DR5, DR9)
  - Surfaced by: Pass 3, Pass 6
  - Files: `packages/ui/src/narration/*`
  - Verify: manual test with cache-hit path (fast) still shows each step ≥400ms; screen reader announces each step
- [ ] **T18 (P2, human: ~4h / CC: ~30min)** — packages/ui — Held-card row treatment on results list (DR6)
  - Surfaced by: Pass 4
  - Files: `apps/web/app/results/*`
  - Verify: arsenal-held rows visually distinct using only locked tokens
- [ ] **T19 (P2, human: ~4h / CC: ~30min)** — packages/ui — Chat message components, unboxed MIMIR responses (DR7)
  - Surfaced by: Pass 5
  - Files: `packages/ui/src/chat/*`
  - Verify: MIMIR responses render unboxed with display-font label; user messages bubbled
- [ ] **T20 (P1, human: ~1d / CC: ~1h)** — apps/web — Mobile filter drawer at <768px (DR8)
  - Surfaced by: Pass 6
  - Files: `apps/web/app/results/*`
  - Verify: filters accessible via bottom sheet on a 375px viewport; hero + list stay above the fold
- [ ] **T21 (P2, human: ~4h / CC: ~30min)** — apps/web — Quiz keyboard contract (DR10)
  - Surfaced by: Pass 6
  - Files: `apps/web/app/quiz/*`
  - Verify: full quiz completable via keyboard only, focus moves correctly on each navigation

---

## Review Log

```
{"skill":"plan-eng-review","status":"clean","unresolved":0,"critical_gaps":0,"issues_found":24,"mode":"FULL_REVIEW"}
{"skill":"plan-design-review","status":"clean","initial_score":4.7,"overall_score":8.5,"unresolved":0,"decisions_made":10}
```

## Review Readiness Dashboard

```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-08-12 (PLAN)   | CLEAR     | YES      |
| CEO Review      |  0   | —                   | —         | no       |
| Design Review   |  1   | 2026-08-12 (FULL)   | CLEAR     | no       |
| Adversarial     |  0   | —                   | —         | no       |
| Outside Voice   |  1   | 2026-08-12          | RAN (Claude subagent) | no |
+--------------------------------------------------------------------+
| VERDICT: CLEARED — Eng Review + Design Review passed                |
+====================================================================+
```

Not a git repository yet (`git rev-parse` fails) — commit-based staleness tracking is unavailable; re-run these reviews once version control is initialized if significant drift occurs before build starts.

## Next Steps — Review Chaining

Eng Review and Design Review are both CLEAR. No fundamental product-direction gaps surfaced (design score started at 4.7/10, not below the 4/10 CEO-review trigger threshold, and no structural information-architecture problems were found) — CEO review is not recommended. All design findings were resolved directly into DR1–DR10 with no deferred visual exploration needed, so `/design-shotgun` isn't called for. No approved mockups exist yet (API key unavailable this session) to hand to `/design-html`.

**Ready to implement.** Optional: revisit visual mockups later via `/design-shotgun` or `/design-html` once an OpenAI API key is configured, using DR1–DR10 as the brief.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 24 issues found, 0 critical gaps, 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4.7/10 → 8.5/10, 10 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE:** Ran as a Claude subagent (Codex CLI not installed) during the eng review. 10 findings surfaced 3 genuine cross-model tensions (architecture complexity vs. PRD §9.2's literal wording; chat vs. quiz-submit as the real quota risk; scripted vs. event-driven narration) and 4 new gaps (cache staleness on card-data updates, chat continuity across profile edits, edit concurrency, tool-call cap sizing) — all resolved with the user, all folded into §1's locked decisions (D9–D14). Design review's outside-voices step was skipped (not requested this session).
- **VERDICT:** ENG REVIEW + DESIGN REVIEW CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
