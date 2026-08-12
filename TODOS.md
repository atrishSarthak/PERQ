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
