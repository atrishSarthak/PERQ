# PERQ — Product Requirements Document
## Feature 3: Goal-Based Purchase Advisor

*Standalone spec for Feature 3. A Claude Code session should be able to build this from this document, PERQ_Design_System.md, and the existing Feature 1 codebase, without needing outside context. Feature 2 (Chrome extension) has not been built yet — this PRD does not assume it exists, and explicitly notes where Feature 3 is now building infrastructure the product handbook originally assigned to Feature 2.*

Status: Ready for build
Last updated: 2026-08-15

---

## 1. Feature Context

This is PERQ's star feature — the one that moves the product past card-optimization (a solved problem SaveSage already runs at scale) into genuine purchase-decision reasoning. The user states a goal in plain language — "I want to book a ticket to the Paris museum," "I want to book a movie ticket" — and MIMIR automatically checks the real channels where that purchase is possible, compares them, and returns one recommendation covering both *where* to buy and *how* to pay, reasoned against the user's card arsenal (Feature 1), financial context, and billing-cycle timing.

**Note on build order:** the product handbook designed this feature to reuse a generic AI page-extraction engine that Feature 2 (the Chrome extension) would already have built. Since Feature 3 is being built first, it now owns building that extraction pipeline itself (§7) and the financial-context profile data (§11) that the handbook originally assigned to Feature 2. When Feature 2 is eventually built, it becomes the second consumer of this infrastructure, not the first — nothing here should be built in a way that's Feature-3-specific if it's reasonably reusable.

**Relationship to Feature 1:** reads the existing `user_profile` and `user_card_arsenal` tables, extends `user_profile.answers` with new fields, and reuses `packages/ai`, `packages/design-tokens`, and the design system already built.

---

## 2. Goals & Non-Goals

**Goals**

- Let a user state a purchase goal in plain language and get one clear, final answer — which channel to buy from and which card/payment method to use — with zero manual comparison work on their part.
- Keep the search bounded and testable: a curated, fixed set of real channels per category, not an open-ended agent browsing the entire internet.
- Reason about real trade-offs — price across channels, card rewards, and billing-cycle timing (float, utilization) — the way a genuinely informed friend would, not just surface the numerically cheapest option.
- Make the 10–30 second wait feel like MIMIR visibly working, not a black-box delay.

**Non-Goals**

- No fully open-ended "AI agent browses the whole internet" behavior — bounded to the fixed channel list in §6.
- No per-goal discovery of "the venue's official site" or "the brand's official site" — the handbook's original wildcard channels are dropped from MVP (see §6 for reasoning); this could be a real post-MVP expansion once the bounded version is proven.
- No automated purchase, checkout, or payment — advisory only, same standing requirement as every other PERQ feature.
- No persistent goal history/dashboard at MVP — see §16.

---

## 3. Tech Stack Additions (on top of Feature 1's stack)

| Layer | Choice |
|---|---|
| Page fetching | Firecrawl (free tier: 1,000 credits/month) — fetches JS-rendered pages and returns clean Markdown/structured content. Chosen over rolling a custom headless-browser pipeline, which is painful on Vercel serverless functions (cold starts, binary size limits, timeout risk). |
| Extraction | Gemini, reusing the same "understand meaning and layout, not fixed CSS selectors" approach designed for Feature 2 — now built here first. |
| Everything else | Unchanged from Feature 1: Next.js full-stack on Vercel, Neon Postgres + Drizzle, Auth.js, Turborepo monorepo. |

**Firm requirement, not a preference:** same API-key boundary as every other feature — Firecrawl and Gemini are called only from server-side routes in `apps/web`, never from client code.

---

## 4. Repo Structure Addition

```
perq/
├── apps/web/
│   └── app/                    # New routes: goal input, loading, results
├── packages/
│   ├── ai/                     # Extended: goal classification, channel
│   │                             extraction, comparison/recommendation
│   │                             prompts and tools, alongside Feature 1's
│   ├── fetch/                  # New: Firecrawl client wrapper — this is
│   │                             the piece Feature 2 will later reuse
│   └── ...                     # ui, design-tokens, db, scoring-engine,
│                                  config unchanged
```

---

## 5. Data Model Additions

Illustrative shape, extends the schema from Feature 1's PRD.

```
user_profile.answers (existing jsonb, extended — see §11 for the fields)

goals
  id, user_id, goal_text, category, created_at

channel_fetch_cache                    -- shared across users, NOT per-user
  id, channel, query_key               -- normalized search terms, e.g.
                                          "movie:oppenheimer:bangalore"
  extracted_data      jsonb            -- structured listing(s) from that
                                          channel for that query
  fetched_at, expires_at

goal_recommendations
  id, goal_id, user_id
  recommended_channel
  recommended_card_id  nullable (fk -> cards)
  billing_cycle_note   text nullable   -- e.g. "wait 3 days — your
                                          statement closes then"
  explanation          text
  channels_checked     jsonb           -- which channels succeeded/failed,
                                          for the transparent "show the
                                          work" narration (§10)
  agent                text default 'MIMIR'
  created_at
```

**Why the fetch cache is shared, not per-user:** the raw facts a channel returns for "Oppenheimer, Bangalore, this weekend" don't depend on who's asking — only the final recommendation does, since that depends on the individual's arsenal and financial context. Two different users searching the same goal share the same channel-fetch cache hit; each still gets their own personalized `goal_recommendations` row computed fresh from it. This is the same cost-control pattern used for Feature 2's `offer_extractions` cache.

---

## 6. Category & Channel Scope (MVP)

Three categories, six fixed channels total — deliberately bounded, per the handbook's own reasoning for why this feature is category-mapped rather than an open-ended browsing agent:

| Category | Channels |
|---|---|
| Movie tickets | BookMyShow, District |
| Travel / attraction tickets | Klook, GetYourGuide |
| Electronics | Amazon, Flipkart |

**Dropped from the handbook's original scope:** "the venue's official site" and "the brand's official site." These aren't fixed channels — they're a different site per goal, which reintroduces exactly the open-ended-search risk the category-mapped design was chosen to avoid. Real post-MVP expansion candidate, not a launch requirement.

---

## 7. Fetch & Extraction Pipeline

1. On a stated goal, MIMIR classifies it into one of the three categories (§8).
2. For each channel in that category, the backend calls Firecrawl to fetch that channel's on-site search results for the goal (e.g., BookMyShow's search results for the movie name + city). Firecrawl handles JS-rendering and returns clean content.
3. Gemini extracts structured listing data from that content (price, availability, session/showtime or product variant, etc.) — same "understand meaning and layout" approach as Feature 2's design, not brittle per-site CSS selectors.
4. Results are cached per `channel_fetch_cache` (§5) so a repeat query against the same channel doesn't re-spend a Firecrawl credit or Gemini call.

This pipeline (Firecrawl client + extraction prompts) lives in `packages/fetch` and `packages/ai` respectively, built to be feature-agnostic so Feature 2 can call the same functions later rather than reimplementing them.

---

## 8. Goal Classification — Agentic, Not Rule-Based

MIMIR classifies a stated goal into a category (§6) as part of its own tool-calling reasoning, not via hardcoded keyword matching. This is consistent with the firm "must be agentic, not a single prompt" requirement already locked in Feature 1 §9.2, and it's what lets MIMIR handle goals phrased in whatever way a real user actually types them ("I want to book a ticket to the Paris museum" has no obvious keyword overlap with "movie tickets," but still needs correct classification into "attraction tickets"). If a goal doesn't map to any of the three supported categories, MIMIR should say so plainly rather than guessing or hallucinating a channel — this is a real, expected outcome at MVP scope, not an error state to hide.

---

## 9. Recommendation Engine — Goal, Not Architecture

Same treatment as Feature 1's and Feature 2's engines: this section states the requirement, not the implementation.

Given a goal, its extracted channel results, the user's card arsenal, financial context, and billing-cycle timing, MIMIR must produce **one** final recommendation covering both where to buy and how to pay — grounded in what was actually checked, weighing real trade-offs rather than just picking the numerically lowest price. Billing-cycle reasoning specifically means: using the user's self-reported statement date, due date, outstanding balance, and credit limit to advise things like waiting until after a statement closes to maximize interest-free float, or flagging utilization impact from an upcoming large purchase — the way a financially literate friend would reason about it, not a generic "use your rewards card" answer. How this comparison and reasoning is actually composed (a single agent call, multiple tool calls, a scoring step plus an LLM synthesis step, or otherwise) is left to Claude Code's engineering judgment. The requirement is the end behavior described above.

---

## 10. MIMIR UX — Show the Work, End to End

- **Loading narration:** reuses the same branded, narrated-steps pattern already built for Feature 1's quiz-submission loading state (MIMIR's avatar + sequential checkmarked steps) — now covering this feature's actual steps, e.g. "MIMIR is checking BookMyShow… MIMIR is checking District… MIMIR is comparing your options… MIMIR is factoring in your cards." This is the honest 10–30 second latency the handbook calls out, framed as visible work rather than a hidden delay.
- **Transparent failure handling:** when a specific channel fetch fails, is blocked, or times out, MIMIR's narration and final explanation must say so plainly — e.g. "couldn't check District right now" — rather than silently excluding it and presenting the recommendation as if every channel had been checked. The `channels_checked` field in `goal_recommendations` (§5) exists specifically to support this — it should record which channels succeeded and which didn't, and the UI/explanation should reflect it.
- **Result presentation:** the final answer ("Buy it on Klook using your Axis card") should be shown alongside a visible breakdown of what was actually compared — not just the winning answer with no visible reasoning trace, consistent with the "show the work" principle applied everywhere else in the product.

---

## 11. Financial-Context & Billing-Cycle Profile (locked fields)

Extends `user_profile.answers` (the same store established in Feature 1) with:

- **Credit score range** — Below 650 / 650–750 / 750+ / I don't know (carried over from Feature 2's original design, now captured here first)
- **Active EMI/loan count** — 0 / 1 / 2 / 3+
- **Statement/billing date** — the day of the month the user's card statement closes
- **Payment due date** — the day of the month payment is due
- **Current outstanding balance** — self-reported
- **Credit limit** — self-reported

All fully self-reported, same as every other PERQ data point — no Account Aggregator, no bank linking. Captured through the same "Edit my profile" panel pattern already built for Feature 1's quiz answers; exact placement/flow within that panel (e.g., whether this is a distinct sub-section) is left to Claude Code, but it must live in the same profile-editing surface, not a separate one.

---

## 12. Cost & Latency Guardrails

- **Shared fetch cache** (§5): channel-fetch results are cached and reused across users querying the same thing, not re-fetched per user.
- **Personalized computation stays cheap:** only the final comparison/recommendation step needs to run per-user; it reads from cached channel data rather than re-triggering fetches.
- **Per-user rate limit:** cap goal searches at 8 per user per day. Firecrawl's free tier is 1,000 credits/month shared across all users; at 2–4 channels per goal, an unlimited single user could meaningfully dent that budget alone. This number is a starting point, easy to adjust once real usage is observed.
- **Graceful degradation:** if Firecrawl or Gemini calls fail entirely for a goal (not just one channel), show a clear "MIMIR couldn't complete this search right now" message rather than a broken or endless loading state.

---

## 13. UX Flow

- **Goal entry:** a dedicated entry point (not buried inside Feature 1's follow-up chat) — a prominent text input where the user states their goal in plain language, placeholder copy in MIMIR's voice (e.g. "I want to book a ticket to…").
- **Loading:** the narrated MIMIR sequence from §10, 10–30 seconds.
- **Results:** one final recommendation, presented with the visible comparison breakdown and any billing-cycle note, styled consistently with the card-container visual language already established for Feature 1's results page (charcoal containers on the pure-black theme, Cabinet Grotesk headlines, Lexend Deca body text, gold/blue MIMIR accent usage).

---

## 14. Compliance & Trust Requirements

- Advisory-only: no purchase, checkout, or payment processing — same as every PERQ feature.
- Automated fetching against third-party sites is a Terms-of-Service consideration, not a regulatory one — state this plainly in-product if surfaced at all (per the brand's "compliance as a confidence signal, stated up front" principle), not hedged or hidden.
- Every recommendation must trace to real, checked data — the channels-checked transparency in §10 is a trust requirement, not just a UX nicety.
- Financial-context and billing-cycle data stays fully self-reported — no new licensing or AA implications from this feature.

---

## 15. Acceptance Criteria

- [ ] A user can type a plain-language goal and receive one final recommendation covering both channel and payment method.
- [ ] Goal classification correctly routes to one of the three categories (movies, attractions, electronics) for realistically-phrased goals, and responds honestly (not a hallucinated answer) when a goal doesn't fit any of them.
- [ ] Each of the six channels can be fetched and have structured data extracted from it without per-channel hardcoded scraping logic.
- [ ] A repeat search for the same goal/query reuses the cached channel-fetch data rather than re-spending Firecrawl credits.
- [ ] The loading state visibly narrates MIMIR's steps for the full 10-30 second duration, never a bare unexplained spinner.
- [ ] When a channel fetch fails, the final result and its explanation say so explicitly rather than silently presenting an incomplete comparison as complete.
- [ ] The recommendation reflects real trade-offs — verified by testing a case where the cheapest raw price isn't the recommended answer because of a card reward or billing-cycle factor.
- [ ] Financial-context and billing-cycle fields are captured in the same profile-editing surface as Feature 1's quiz answers, and editing them affects future recommendations.
- [ ] A single user cannot exceed 8 goal searches per day.
- [ ] No Firecrawl or Gemini credentials are ever referenced from client-side code.

---

## 16. Explicitly Deferred

- Per-goal "official site" discovery (venue/brand sites) — dropped from MVP per §6.
- Persistent goal history / a dashboard of past searches.
- Expanding beyond the six fixed channels or three categories.
- Any UI for adjusting the 8-goal-per-day rate limit — fixed for MVP, revisit once real usage data exists.

---

## 17. Handoff Notes for the Claude Code Session

- Read this PRD, the Feature 1 PRD, and PERQ_Design_System.md before starting. This feature reuses Feature 1's profile store, design tokens, and MIMIR narration pattern rather than inventing new ones.
- `packages/fetch` and the extraction logic in `packages/ai` should be built feature-agnostic — Feature 2 will be the second consumer of this code, not the first, so avoid hardcoding anything Feature-3-specific into what's genuinely shared infrastructure.
- Section 9 (recommendation engine) and the billing-cycle reasoning within it are stated as a goal, not an architecture — use engineering judgment, check against §15's acceptance criteria, not against any assumed internal design.
- The channel list in §6 is deliberately fixed and small. Don't quietly expand it or add "official site" discovery back in without it being a conscious, separate decision — that reintroduces the reliability risk the bounded design was chosen to avoid.
