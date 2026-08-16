# PERQ — TODOs

Deferred work captured with context, per `/plan-eng-review`. Not blockers for Feature 1's build.

## Rate limiting on /api/quiz/submit

**What:** Add per-user rate limiting on the quiz-submission endpoint, beyond the 10-round tool-loop cap (Perf-B/D13, see `PERQ_Feature1_Engineering_Plan.md`) already locked.

**Why:** The tool-loop cap bounds a single request's cost, but nothing stops a user from re-submitting the quiz repeatedly, burning free-tier quota faster than expected.

**Pros:** Protects the shared Gemini free-tier quota (PRD §3) from a single user starving everyone else; cheap to add later without touching the agent architecture.

**Cons:** Not needed for a course-project demo with few concurrent users; adds a dependency (in-memory or KV-backed limiter) with no clear number to pick yet.

**Context:** Revisit once real usage patterns exist — the fallback template (D7) already means quota exhaustion degrades gracefully rather than breaking, so this is a cost/fairness concern, not a correctness one. **Narrowed scope note:** chat-endpoint rate limiting was originally bundled into this TODO, but the outside-voice review (see plan's GSTACK REVIEW REPORT) correctly identified chat as the bigger quota risk — that guardrail (D9: per-session turn cap) was moved IN scope for the v1 build, not deferred. This TODO now covers quiz-submit only.

**Depends on:** nothing — additive.

---

## Backfill path from fallback_template → real Gemini explanation

**What:** A manually-triggered script (not a background job/notification — PRD §2 explicitly forbids ongoing engagement loops) that finds `recommendations` rows with `explanation_source='fallback_template'` and re-attempts the Gemini call, e.g. after a quota reset.

**Why:** D7's `explanation_source` column makes degraded rows queryable, but nothing currently upgrades them — a user who hit a quota-exhaustion window keeps a template explanation forever unless they edit their profile again.

**Pros:** Closes the loop D7 opened; cheap query (`WHERE explanation_source='fallback_template'`); reuses the exact same Gemini-call code path already built.

**Cons:** Not a blocker — the fallback template still satisfies Design System §5's "never a bare score" rule, so this is a quality upgrade, not a correctness fix; needs to stay a manual/scriptable trigger, not a cron, to respect the Non-Goals.

**Context:** The column already exists in the locked schema (D7); this just adds the consumer.

**Depends on:** D7's `explanation_source` column (already locked).

---

## Revisit Gemini Interactions API for chat state once mature

**What:** Re-evaluate migrating D2's hand-rolled Postgres context-reconstruction to Google's Interactions API (GA June 2026) once it has a longer production track record.

**Why:** D2 rejected it for v1 specifically because it's ~2 months old with unproven retention guarantees — that reasoning has a shelf life, not a permanent verdict.

**Pros:** Could simplify `apps/web/lib/mimir`'s chat context code later if the API proves reliable; worth a scheduled second look rather than an implicit "never revisit."

**Cons:** Speculative — no concrete trigger date, just "later"; low priority relative to shipping Feature 1.

**Context:** This is purely a note-to-future-self so the D2 rationale doesn't get forgotten as a permanent architectural law.

**Depends on:** nothing.

---

## Tune per-category channel_fetch_cache TTL once real usage exists

**What:** Revisit the per-category TTL values locked in `PERQ_Feature3_Engineering_Plan.md` (movies/attractions ~4-6h, electronics ~24h) against real Firecrawl staleness patterns.

**Why:** These are estimates, not measured against real channel behavior — wrong values either waste Firecrawl credits (too short) or serve stale showtimes/prices into a billing-cycle recommendation (too long).

**Pros:** Cheap to revisit once real usage data exists; doesn't block Feature 3's launch.

**Cons:** No concrete trigger date, just "once usage exists" — same shape as D13's "tune further once real Gemini usage logs exist" note, not a scheduled follow-up.

**Context:** Feature 3's PRD didn't specify a TTL at all (§12 is silent) — the per-category split and specific hour values are new design produced during `/plan-eng-review`, more speculative than the PRD's own numbers (e.g. the 8/day cap, which the PRD itself already calls "a starting point").

**Depends on:** nothing — additive.

---

## Timezone-aware reset boundary for the 8-goal-searches/day cap

**What:** Make the daily rate-limit reset (locked as UTC calendar day in `PERQ_Feature3_Engineering_Plan.md`) timezone-aware once user timezone is captured somewhere in the profile.

**Why:** UTC midnight is 5:30am IST — not a natural reset point for PERQ's actual Indian user base. A user capped out late at night sees the cap persist past their own local midnight.

**Pros:** Better UX once addressed; the change itself is cheap (swap the day-boundary calculation in the rate-limit COUNT query).

**Cons:** No field currently captures user timezone — this depends on that being added first; PRD §16 explicitly says no UI for adjusting the rate limit at MVP, so this isn't urgent.

**Context:** PRD §12 frames the 8/day number itself as "a starting point, easy to adjust" — this note extends that same spirit to the reset boundary, not just the count.

**Depends on:** capturing user timezone somewhere (not currently planned in any feature's data model).

---

## Stand up a real E2E runner (or formally retire the Playwright recommendation)

**What:** Either install Playwright (as `PERQ_Feature1_Engineering_Plan.md` §6 originally recommended) and wire it into CI, or make a deliberate call that Vitest + Testing-Library component/integration tests ARE the intended E2E strategy going forward, and stop flagging paths `[→E2E]` in future plan reviews.

**Why:** Both Feature 1's and Feature 3's `/plan-eng-review` test diagrams flag several `[→E2E]` paths (full quiz→results flow, full goal-search→result flow) that currently have nowhere to land as true browser E2E tests — no Playwright config exists anywhere in the repo despite the recommendation.

**Pros:** Closes a cross-feature gap once, instead of re-flagging it on every future feature's plan review.

**Cons:** Real infra work (Playwright setup + CI wiring) unrelated to any single feature's own scope — doesn't belong bundled into Feature 3's build.

**Context:** `apps/web/test/*.test.tsx` already uses Testing-Library patterns that cover a meaningful chunk of what E2E would test (e.g. `QuizWizard.test.tsx`, `ResultsView.test.tsx`) — this may be more a documentation-vs-reality gap (the plan says Playwright, the repo does something else) than a genuinely missing tool.

**Depends on:** nothing, but affects how every future `[→E2E]`-flagged plan-review finding actually gets closed.

---

## Movie category needs a two-hop fetch to reach real prices

**What:** BookMyShow's and District's real, working URLs (`/explore/movies-{city}`, `/{city}/movies` — T0's fix for the original non-functional `?q=` search pattern) are city-wide "movies now showing" listings. A live end-to-end test (2026-08-16) confirmed these show WHICH movies are playing but not per-showtime prices — a real ticket price lives one hop deeper, on each movie's own detail/booking page (e.g. `district.in/movies/awarapan-2-movie-tickets-MV194046`, a URL only discoverable from within the listing page's own links). The current single-hop-per-channel design (D2/D4) can classify and fetch correctly but will realistically return `checked_empty` for most real movie searches, not a priced result.

**Why:** This is the movie category's core promise (PRD §1's example goal is literally "book a movie ticket") currently unable to reach a real price in the common case — verified live, not a theoretical gap.

**Pros of fixing now:** Closes the most product-critical gap Feature 3 has; the electronics/attraction categories don't have this problem (their search-results pages show prices inline, confirmed live for electronics).

**Cons:** A real architecture change, not a bug fix — doubles Firecrawl cost for movies specifically (listing fetch + detail-page fetch, 2 credits/channel instead of 1), doubles latency for movies within the existing 10-30s narration budget (D4), and needs its own cache-key/TTL decision for the detail-page fetch (same query_key as the listing, or a second cache dimension?). D2's "channel fetching is fully deterministic, model never chooses what to fetch" principle should still hold — the model would identify which detail-page URL to follow from the listing's own extracted links, but the FETCH of that URL should still be app code, not a model tool call.

**Context:** Attractions (klook/getyourguide) were not confirmed to have the same gap in this pass — their search pages showed inline pricing/filtering in the raw markdown, unlike movies' bare listing pages — but that wasn't verified with a full live extraction the way movies and electronics were, so treat that as a reasonable inference, not a confirmed fact.

**Depends on:** a decision on whether to extend D2/D4's single-hop-per-channel design to two hops for movies specifically, or accept degraded movie-category coverage as a known MVP limitation.

---

## Revisit the 3/day goal-search cap now that real Firecrawl credit cost is known

**What:** D8's cap was set to 3/day based on an estimated 2-4 credits/channel; T0 (2026-08-16) confirmed the real cost is 1 credit/scrape. At the real number, 3/day/user × 2 channels = 6 credits/day, ~18% of the shared ~33/day budget for one maxed-out user — real headroom exists to raise the cap.

**Why:** The original 3/day figure was a conservative response to an overestimate; the PRD's own §12 language treats the exact number as adjustable, not the locked part (the locked part is bounding one user's blast radius on shared quota, which 3/day still does with room to spare).

**Pros:** A higher cap (e.g. 5-6/day) gives users more genuine value from the feature without meaningfully risking the shared Firecrawl budget, going by Firecrawl credits alone.

**Cons:** Firecrawl credit cost is only half the real constraint — each search also spends Gemini API calls (classification + up to 2 extractions + narration), against Gemini's own separate free-tier quota, which this credit math says nothing about. Raising the cap without checking that quota too could just move the bottleneck rather than remove it.

**Depends on:** nothing to revisit the number itself; a real answer depends on checking Gemini's free-tier RPD/RPM quota against realistic concurrent-user assumptions, not done in this pass.
