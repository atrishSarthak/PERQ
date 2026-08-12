# PERQ — Product Requirements Document
## Feature 1: Card Recommender

*This is the complete, standalone spec for Feature 1. A Claude Code session should be able to build the entire feature from this document plus the companion PERQ Design System doc, without needing outside context. It supersedes the earlier separate Decisions Log / System Design drafts — everything relevant from those has been folded in here.*

Status: Ready for build
Last updated: 2026-08-11

---

## 1. Product Context

**PERQ** is an AI financial advisor for Gen Z Indians, reasoning across every way a purchase can be paid for — credit cards, BNPL, cash/UPI — personalized to the user's actual financial picture. The product is powered by one named AI agent, **MIMIR**, across three planned features. This PRD covers only **Feature 1**.

**Feature 1 — Card Recommender:** a one-time onboarding quiz that captures a user's spend pattern and existing cards, then returns a ranked, explained set of credit card recommendations. It's the acquisition layer of the product (free, per the business model) and the foundation the other two features build on — Feature 2 (Chrome extension) reads the "card arsenal" this feature establishes, and Feature 3 (goal-based advisor) reasons against the same profile.

**Target user:** Gen Z college students and first-jobbers in India — largely new to credit, price-sensitive, and allergic to anything that feels like a bank lecturing them or a social app manipulating them.

**Brand positioning (governs every requirement below):** "Agentic, not conversational" and "show the work, don't hide it." Feature 1 is the one exception to "agentic" — a quiz is inherently input-driven — so it should be framed as *setup*, not MIMIR's hero moment. But even here, MIMIR should never feel like a static form-to-PDF generator: the explanation and follow-up chat are where the agentic feel has to show up.

---

## 2. Goals & Non-Goals

**Goals**

- Capture a user's spend pattern and existing cards through a short, low-friction quiz.
- Produce a ranked list of card recommendations that is demonstrably reasoned, not just calculated — grounded in the user's actual data, explainable, and able to surface non-obvious trade-offs.
- Let a returning user see fresh, editable recommendations without repeating the whole quiz.
- Let a user ask MIMIR follow-up questions about their recommendation, with MIMIR fully aware of what it already told them.
- Feel like a genuine financial product a Gen Z user would trust — not a spreadsheet, and not a social-media-style engagement trap.

**Non-Goals (explicit boundaries — not deferred, not "later," out of scope for this feature)**

- No Account Aggregator integration, no bank linking, no OAuth into financial institutions. All data is self-reported.
- No admin panel for managing card data — maintenance happens through a script (§7).
- No push notifications or email — this is a single-session onboarding flow, not an ongoing engagement loop.
- No payment processing, no card application flow. The product only ever recommends; the user acts on it in their own banking apps.
- No dark-pattern gamification — no streaks, badges, fake scarcity, or countdown timers. Nothing in this feature should look like it's trying to keep someone scrolling.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript — single app, frontend and backend both live here (Route Handlers / Server Actions) |
| UI | Tailwind CSS + shadcn/ui, themed per the Design System doc |
| Hosting | Vercel (single deployment) |
| Database | Postgres via Neon (serverless) |
| ORM | Drizzle |
| Auth | Auth.js (NextAuth) — single source of truth for identity, since there's no separate backend service |
| AI | Google Gemini API, free tier, Flash-tier model. Pin the exact model identifier and confirm current free-tier quota (RPM/RPD/TPM) in Google AI Studio at implementation time — don't hardcode a number that will go stale. |
| Monorepo tooling | Turborepo + pnpm workspaces |

**Why this stack, briefly:** Next.js-only (no separate Spring Boot service, which was considered and deliberately dropped) keeps this buildable by someone new to the stack, with one deployment target and no cross-service auth boundary to get wrong. Vercel's function limits (up to 300s on the Hobby plan with Fluid compute) comfortably cover a multi-step Gemini tool-calling call, so this isn't a real constraint.

---

## 4. Repo Structure

```
perq/
├── apps/
│   └── web/                    # Next.js app — all of Feature 1 lives here
│       ├── app/                # App Router routes (quiz, results, profile, api/*)
│       └── components/         # App-specific components, composed from packages/ui
├── packages/
│   ├── ui/                     # shadcn/ui-based components, themed with design tokens
│   ├── design-tokens/          # Colors, type scale, spacing — see Design System doc
│   ├── db/                     # Drizzle schema, migrations, Neon client, card seed/update script
│   ├── scoring-engine/         # Card-ranking logic — pure, testable, reused by Feature 2/3 later
│   ├── ai/                     # Gemini client, MIMIR's tool-calling agent logic, prompt templates
│   └── config/                 # Shared tsconfig/eslint/prettier
├── turbo.json
└── pnpm-workspace.yaml
```

**Rule for this and every future feature PRD:** logic that isn't purely UI goes in a `packages/*` module, not directly in `apps/web`. This is what lets Feature 2 (a future Chrome extension, `apps/extension`) reuse the scoring engine and AI client without duplicating them.

---

## 5. Data Model

Illustrative shape — exact Drizzle column types are an implementation detail, but these entities and their relationships are locked.

```
users
  id, email, created_at            -- plus Auth.js-managed session/account tables

user_profile
  id, user_id (fk, unique)
  answers        jsonb             -- current state of all 13 quiz answers, keyed by question_key
  updated_at

cards
  id, name, issuer, network, tier
  joining_fee, annual_fee, fee_waiver_condition
  reward_rates          jsonb      -- per category: dining, travel, hotels, fuel, groceries, e-commerce, utilities, general
  milestone_benefits    jsonb
  welcome_bonus
  lounge_access         jsonb      -- domestic/international count + conditions
  forex_markup_pct
  redemption_value      numeric    -- ₹ per point, for comparing cards on different point systems
  min_income_eligibility
  co_brand_partner      nullable
  source_updated_at                -- staleness tracking

recommendations
  id, user_id, card_id, rank, score
  explanation      text            -- MIMIR's grounded, plain-language reasoning
  agent            text default 'MIMIR'
  profile_snapshot jsonb           -- the user_profile.answers this recommendation was computed from
  created_at

user_card_arsenal
  id, user_id, card_id
  status           text            -- 'held' | 'not_held'
  updated_at
```

**Why `user_profile` is a single mutable row, not an append-only log:** the returning-user flow (§11) needs to edit one answer at a time and re-render immediately — a current-state row is the natural fit. Auditability is still covered: every `recommendations` row snapshots the exact profile it was computed from, so a past recommendation stays explainable even after the user edits their profile later.

**Intentionally not specified here:** any table for storing MIMIR follow-up chat/conversation state. Whether that's a persisted table, in-memory + re-hydrated context, or something else is left to the Claude Code build — see §9's framing of what's required versus what's open.

---

## 6. Auth

Auth.js (NextAuth), Drizzle adapter, Postgres-backed sessions. Suggested default: email/password to start, with Google OAuth as an easy low-friction add — Gen Z users skew toward one-tap Google sign-in, but either works with this setup and isn't a blocking decision.

---

## 7. Card Database

- **Scope:** 100–120 Indian credit cards (expanded from the original 20–30 scope in the product handbook — this is real research/content work, budget for it accordingly).
- **Schema:** as in §5's `cards` table.
- **Maintenance:** a CLI script in `packages/db` (e.g. `pnpm db:seed-cards path/to/cards.json`) that upserts structured source data into the table. No admin UI. Compile the researched data as JSON/CSV first, then load it — updating a card's terms later means editing the source file and re-running the script, not hand-writing SQL.
- `source_updated_at` makes staleness visible per card rather than silent.

---

## 8. Quiz — Questions & Flow

**Flow:** modal step wizard. One question per screen, a visible progress indicator ("Question 4 of 13"), and a back button. On the final step, transition into the "MIMIR is working" narration (§9) before landing on results.

**Questions (13):**

1. Which credit cards do you currently hold? (multi-select, searchable, "I don't have any yet") — asked first since it affects the arsenal and what's even worth recommending.
2. Approximate annual income bracket (many premium cards have income minimums).
3. Flight frequency, domestic + international combined (Never / 1–2 / 3–5 / 6+ per year).
4. Hotel stays for leisure or work (same scale).
5. Active gym/fitness membership, and roughly what it costs monthly.
6. Monthly food delivery spend (Swiggy/Zomato) — bucketed (<₹1k, ₹1–3k, ₹3–6k, ₹6k+).
7. Monthly e-commerce spend (Flipkart/Amazon/Myntra, etc.) — bucketed.
8. Monthly grocery spend.
9. Monthly dining-out spend (restaurants, not delivery).
10. Monthly fuel spend.
11. Do you pay recurring bills/subscriptions by card?
12. Fee tolerance: open to an annual fee if the rewards outweigh it, or ₹0-fee only?
13. Top priority — pick up to 2: Travel & lounge / Cashback / Dining / Online shopping / Fuel / No preference.

**Explicitly not a quiz question:** preferred card network (Visa/Mastercard/RuPay/Amex). This is handled as a filter on the results page (§10) instead — it's a preference to apply afterward, not a spend-pattern signal the engine needs to compute a ranking.

---

## 9. MIMIR — AI Agent Requirements

This section states requirements, not architecture. How Claude Code satisfies them is its engineering call; what follows is what "done" looks like.

### 9.1 Recommendation engine — the goal

The system must reason over the user's stored profile against the full card database and produce a ranking *and* explanation that feels genuinely weighed — not a static formula silently narrated after the fact. Per the product handbook's original intent, the AI's role isn't limited to restating a number; it should surface non-obvious trade-offs a pure ranking would miss (e.g., a card that scores well numerically but doesn't fit the user's real spend pattern should get called out as such). Whether Gemini re-weighs a deterministic score, computes trade-offs directly, or some hybrid, is left to Claude Code. **The requirement is the end result: a recommendation that reads as reasoned, not calculated.**

### 9.2 Must be agentic, not a single prompt

Gemini must be invoked as a tool-calling agent — able to call functions to fetch the user's profile, run the card comparison, and pull card details — rather than receiving one large prompt and returning one block of text. This is a firm requirement, not a suggestion: it's what makes the "show the work" UI narration in §9.3 possible, and it's what keeps the explanation grounded in real data instead of the model inventing plausible-sounding reasons.

*Illustrative (non-binding) example of what this could look like:* tools such as `getUserProfile()`, `scoreCards(profile)` (which calls the actual scoring logic in `packages/scoring-engine`, not the LLM), and `getCardDetails(cardId)`. Gemini calls these, receives structured results, and is instructed to ground its explanation only in fields actually present in the tool output. Claude Code may design the exact tool boundaries differently — this is one way to satisfy §9.1 and §9.2, not the mandated way.

### 9.3 Show the work

Each step MIMIR takes should be visibly narrated in the UI as it happens — e.g. "MIMIR checked your profile," "MIMIR scored 118 cards," "MIMIR is writing your recommendation" — not a silent spinner. This is a standing brand principle (see Design System doc §5) and applies directly here.

### 9.4 Follow-up chat — full context required

After a recommendation is shown, the user can open a follow-up chat with MIMIR ("why not the travel card?", "what if I flew more?"). **MIMIR must already know, for that conversation, the user's quiz answers, their derived profile, and the specific recommendation(s) it just gave.** Every follow-up answer must read as a continuation of an already-informed conversation, not a fresh, context-less exchange — this is the single detail that most determines whether the product feels like a real agent or a wrapper around a stateless API call. Ask "why not the travel card" and MIMIR should reference the actual card it ranked for this actual user, not give a generic answer.

How that context is carried — conversation history, re-supplied structured context per turn, stored session state, or something else — is, again, an implementation decision for Claude Code, not prescribed here.

### 9.5 Cost / free-tier guardrails (build these into v1, not later)

- Cache the explanation by profile hash — an identical profile shouldn't trigger a redundant Gemini call.
- When a user edits one profile answer (§11), only re-call Gemini for a fresh explanation if the #1-ranked card actually changes; the scoring re-run itself is cheap/instant and doesn't need this guard.
- If a Gemini call fails or the free-tier quota is exhausted, still show the ranked list with a non-AI fallback explanation template rather than blocking the feature entirely.

---

## 10. Results Page (Skyscanner-inspired)

**Layout:**

- **Left sidebar — filters:** card network, issuer, annual fee range, category tags (Travel/Cashback/Dining/Fuel/Shopping/Lounge), "show cards I already hold" toggle, "₹0 joining fee only" toggle.
- **Top — sort tabs:** *Best Match* (MIMIR's ranked pick) / *Lowest Fee* / *Highest Rewards*. These re-sort the same result set; they aren't separate queries.
- **"MIMIR's Top Pick" hero card**, shown above the ranked list. Visually distinct from the rest of the list, but **deliberately not styled like a sponsored/ad placement** — looking like a paid slot would undercut the neutral-advisor trust the product depends on.
- **Ranked list below:** each row shows the card (issuer/logo, name), MIMIR's one-line grounded reasoning, annual fee, and the arsenal CTA (§12).

---

## 11. Returning-User Flow & Profile Editing

A returning user with a saved profile skips the quiz entirely and lands directly on the results page, computed from their last saved `user_profile.answers`.

An **"Edit my profile"** panel lists all 13 quiz answers individually, each independently editable (e.g., "Flight frequency: 3–5 times/year — flew more since then? Update it here"). Editing one answer:

1. Updates `user_profile.answers`.
2. Re-runs the scoring/ranking immediately (cheap, deterministic-enough to not need a loading state).
3. Only triggers a new Gemini explanation call if the top-ranked card changed as a result (per §9.5's cost guardrail).

---

## 12. Card Arsenal Marking

Every card shown anywhere in the results list — recommended or just browsed via filters — carries a two-state toggle: **"Add to My Arsenal"** ⟷ **"✓ In My Arsenal."** Flipping it updates `user_card_arsenal.status`. This is the same underlying action whether it's triggered from quiz Question 1 ("which cards do you hold") or corrected later from the results page — one mutation, two entry points into it.

---

## 13. Compliance & Trust Requirements

- All data is self-reported; no bank linking, no Account Aggregator, no third-party financial data pulls.
- Advisory-only: the product never initiates a transaction, never stores payment credentials.
- Every recommendation's explanation must visibly trace back to the user's own quiz/profile data — never to which card issuer might pay a higher affiliate commission, even once monetization is added later. This is a trust requirement to hold from day one, not retrofit.
- No urgency or scarcity language anywhere in this feature ("only 2 spots left," countdowns, etc.) — MIMIR's tone should read as considered advice, consistent with the Design System doc's voice guide.

---

## 14. Acceptance Criteria

Feature 1 is done when:

- [ ] A new user can complete the 13-question modal quiz (with back/progress) and reach a results page.
- [ ] Recommendations are computed against the real card database (100–120 cards) and shown with MIMIR-attributed, grounded explanations — with each computation step visibly narrated, not a silent spinner.
- [ ] The results page matches the Skyscanner-inspired layout: filters sidebar, sort tabs, a non-ad-styled "Top Pick" hero, and a ranked list below.
- [ ] A card can be marked "in my arsenal" from either the quiz or the results page, with consistent state.
- [ ] A returning user with a saved profile skips the quiz and sees results immediately.
- [ ] A user can edit any single profile answer and see recommendations update without redoing the full quiz; a new Gemini explanation call only fires if the top card changes.
- [ ] A user can open MIMIR's follow-up chat and get answers that reference their actual profile and actual given recommendations — verified by asking a question whose correct answer depends on session-specific data, not something a generic prompt could answer.
- [ ] No Account Aggregator/bank-linking, no payment flow, and no gamification/urgency pattern exists anywhere in the built feature.
- [ ] All UI is built from the Design System doc's tokens; both light and dark themes render correctly.
- [ ] `GEMINI_API_KEY` and `DATABASE_URL` are never referenced from client-side code; `.env.example` lists every required variable with no values committed.

---

## 15. Explicitly Deferred (not blockers for Feature 1)

- Illustration/iconography style, motion/animation conventions, logo/wordmark treatment — decide during build, not before.
- Exact Gemini model identifier and free-tier quota numbers — confirm in Google AI Studio at implementation time.
- OAuth provider choice beyond the suggested email/password + optional Google default in §6.

---

## 16. Handoff Notes for the Claude Code Session

- Read this PRD and the companion **PERQ Design System** doc in full before writing code. Design tokens (color, type, spacing, voice) are locked there and apply to every screen in this feature.
- Non-goals in §2 are hard boundaries, not soft suggestions — don't add "just a little" bank-linking or a "simple" admin panel because it seems convenient mid-build.
- Anything marked as a "goal" rather than an "architecture" in §9 is intentionally open — use engineering judgment, but the acceptance criteria in §14 are what gets checked against, not any specific implementation approach.
- Shared logic (scoring, AI client, design tokens) belongs in `packages/*`, not `apps/web` directly — this feature is the first of three, and what gets built reusably here saves real work on Feature 2 and 3.
