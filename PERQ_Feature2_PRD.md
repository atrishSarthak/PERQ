# PERQ — Product Requirements Document
## Feature 2: Chrome Extension — Offer Reader + Payment-Method Advisor

*Standalone spec for Feature 2. A Claude Code session should be able to build this from this document, the companion PERQ Design System doc, and the existing Feature 1 codebase (which this feature extends, not replaces), without needing outside context.*

Status: Ready for build
Last updated: 2026-08-12

---

## 1. Feature Context

PERQ's Feature 1 (Card Recommender) established a user's card arsenal and profile. Feature 2 takes MIMIR out of the web app and into the browser: a Chrome extension that watches the pages a user is actually shopping on — not a hardcoded list of supported sites — detects offers and payment options in real time, and recommends which card or payment method to use, cross-referenced against the arsenal and profile Feature 1 already built.

This is the first of the two "hero moment" features the product handbook calls out — MIMIR *doing* something (reading a real page, acting on it) rather than answering a question a user typed. Feature 1 was the conversational exception (a quiz); this one is where "agentic, not conversational" actually has to show up in the product.

**Relationship to Feature 1:** this feature is additive. It reads the same `user_profile` and `user_card_arsenal` tables, extends the profile with new fields, and reuses the AI client and design tokens from `packages/ai` and `packages/design-tokens`. It does not change anything already shipped in Feature 1.

---

## 2. Goals & Non-Goals

**Goals**

- Detect offers, discounts, cashback, and BNPL/EMI options on any shopping page the user visits, without requiring per-site engineering.
- Keep the cost of "watching every page" near zero by scanning locally first, and only escalating to an AI call when there's a real signal.
- Recommend one specific action — which card to use, or to avoid stacking another EMI — grounded in the user's actual arsenal and financial context, not a generic "here are some offers."
- Feel like MIMIR is genuinely watching out for the user in the background, consistent with the "agentic, not conversational" positioning — not a tool the user has to remember to open.

**Non-Goals**

- No parsing of a specific BNPL provider's live fee/interest fine print — see §8's iframe constraint. Badge-level detection only.
- No payment processing, no auto-application for a card, no auto-initiating anything — advisory only, same as Feature 1.
- No hardcoded per-site scraping logic (fixed CSS selectors) — extraction has to work off page meaning/layout via the AI step, per the handbook's explicit design intent.
- No Chrome Web Store publishing in this feature's scope — see §10.
- No separate mini-chat UI crammed into the injected widget — see §9.

---

## 3. Tech Stack Additions (on top of Feature 1's stack)

| Layer | Choice |
|---|---|
| Extension platform | Chrome only, Manifest V3 |
| Content script | Local signal detection (§7), runs on every page load |
| Background service worker | Session detection, message routing between content script and backend API |
| Injected UI | React, mounted in a Shadow DOM root to avoid CSS collisions with the host page, styled from `packages/design-tokens` — same visual system as the web app |
| Backend | Reuses the existing Next.js app (`apps/web`) — the extension calls it, it never calls Gemini directly |

**Firm requirement, not a preference:** the Gemini API key never ships inside extension code. Extension bundles are trivially unpacked and read by anyone who installs them, unlike a server-rendered web app — so the extraction and matching calls happen via a Next.js API route in `apps/web`, exactly as they do for Feature 1's AI calls. The extension is a thin client end to end.

---

## 4. Repo Structure Addition

```
perq/
├── apps/
│   ├── web/                    # Unchanged from Feature 1, plus new API routes for this feature
│   └── extension/              # New: Manifest V3 extension
│       ├── content-script/     # Local signal detection (§7)
│       ├── background/         # Service worker: session check, message routing
│       └── widget/             # Injected React UI, Shadow DOM, consumes packages/ui + design-tokens
├── packages/
│   ├── ai/                     # Extended: extraction + matching prompts/tools alongside Feature 1's
│   └── ...                     # ui, design-tokens, db, scoring-engine, config unchanged
```

---

## 5. Data Model Additions

Extends the schema from the Feature 1 PRD. Illustrative shape, not mandated column-for-column.

```
user_profile.answers (existing jsonb, extended)
  + new financial-context fields — see §11 (intentionally left open)

offer_extractions                       -- cache, keyed by page, NOT by user
  id, url_hash, extracted_at, expires_at
  extracted_data      jsonb             -- offer/payment info as pulled from the page

offer_recommendations
  id, user_id, offer_extraction_id (fk)
  page_url, recommended_action          -- e.g. "use_card", "avoid_bnpl"
  recommended_card_id  nullable (fk -> cards)
  explanation           text
  agent                 text default 'MIMIR'
  created_at
```

**Why extraction is cached separately from the per-user recommendation:** the raw facts on a page (what offer is showing, what payment badges are present) don't depend on who's looking at it — only the recommendation does, since that depends on the individual's arsenal and financial context. Caching `offer_extractions` by a hash of the URL (and ideally page content, since URLs can be stable while promotional content changes) means a second visit to the same page — by the same user or a different one — doesn't need a fresh Gemini call at all; only the (cheap, non-AI) matching step re-runs per user. This is the main lever for keeping this feature inside Gemini's free tier despite running on every page visit instead of once per onboarding.

---

## 6. Extension Auth — Shared Web Session

**Requirement:** if the user is logged into the PERQ web app in the same browser, the extension must recognize that session automatically — no separate login screen.

*Illustrative (non-binding) mechanism:* the background service worker calls a same-origin endpoint on the Next.js app (e.g. `/api/extension/session`) with credentials included; because it's a request to the same domain the user is already authenticated against, the existing session cookie is attached automatically, and the endpoint returns whether there's an active session (and for whom). Exact implementation — cookie-based, a short-lived token exchange, or otherwise — is Claude Code's call. What's required is the outcome: no second login surface to build or maintain.

---

## 7. Local Signal Detection (content script)

Runs on every page load, no AI call, near-zero cost. Only a positive match escalates to §8.

Starting keyword/pattern set (non-exhaustive — extend as needed during build):

- **Discount language:** "% off," "flat ₹X off," "discount," "deal," "sale"
- **Cashback language:** "cashback," "cash back," "get ₹X back"
- **BNPL/EMI language:** "EMI," "no cost EMI," "pay in installments," "pay later," "buy now pay later"
- **BNPL provider names** (badges name themselves directly): "Simpl," "LazyPay," "ZestMoney," "Slice," "Amazon Pay Later"
- **Bank-offer language:** "instant discount with [bank] card," "bank offer"
- **Fallback signal:** a ₹ symbol near price-like text, as a lower-confidence catch-all

---

## 8. AI Extraction Step

On a positive local signal, the extension sends the visible page text / cleaned DOM to the backend, which calls Gemini to extract offer and payment information by understanding meaning and layout — not fixed CSS selectors. This is what makes "works on a site we never specifically coded for" possible and is the actual technical differentiator of this feature.

**Hard technical constraint (a fact, not a decision):** BNPL/payment widgets (Simpl, LazyPay, etc.) typically render inside iframes served from a different domain than the merchant site, for PCI-DSS reasons. A content script cannot read across that boundary — this is a browser security wall, not something more engineering effort closes. What's readable is the merchant page's own promotional copy about BNPL (e.g. a "Pay in 3 with Simpl, no cost EMI" badge), never the live fee/interest fine print behind it. MVP scope is badge-level detection plus advice grounded in the user's self-reported financial context — not real-time parsing of a specific BNPL offer's terms. (Deep parsing of a specific offer, where the user deliberately provides it, is Feature 3's job.)

---

## 9. Offer-to-Card Matching Engine — Goal, Not Architecture

*(Locked as previously drafted, unchanged.)*

Given an extracted offer or BNPL badge, the system must reason over the user's card arsenal, that offer's actual value across those cards, and their financial context to recommend one specific action — grounded in the real offer and the real user, not just "pick whichever card has the highest raw cashback %." It should weigh trade-offs the way a person would: *"this bank offer is technically bigger, but you're already carrying 2 EMIs, so paying by debit card is the smarter move here."* Whether this is implemented via the same tool-calling agent pattern from Feature 1, a dedicated new tool, or some other design is left to Claude Code — the requirement is the end behavior, not the mechanism.

---

## 10. MIMIR in the Extension — UI & Interaction Model

- **Scan trigger:** automatic. The content script scans every page as the user browses (§7); this is a deliberate choice to match "PERQ lives wherever you're shopping" rather than requiring the user to remember to click something.
- **Surface:** an injected in-page widget (Shadow DOM, React), appearing near the offer it found — not a toolbar-popup-only experience. It must be dismissible and must not break the host page's layout.
- **Show the work:** consistent with the brand principle from the Design System doc, the widget should narrate what MIMIR is doing when there's a visible delay (e.g. "MIMIR is checking this offer") rather than a silent spinner.
- **Depth (proposed default, adjustable):** the widget shows a grounded one-to-two-line reasoning and a single recommended action — not a full chat. An "Ask MIMIR more" link opens the existing Feature 1 follow-up chat in the web app, passed this page's offer as extra context, rather than building a second, cramped chat surface inside the extension. This keeps scope tight and reuses Feature 1 infrastructure instead of duplicating it.

---

## 11. Financial-Context Profile — Intentionally Open

Feature 2 needs self-reported financial context beyond Feature 1's quiz — specifically **credit score** and **current EMI/loan count**, per the product handbook, still fully self-reported with no Account Aggregator or bank linking involved. This data lives in the same `user_profile.answers` store Feature 1 already established (§5), not a separate table.

**Deliberately not specified here:** the exact field format (bucketed vs. numeric), question wording, and capture flow (a first-run setup inside the extension vs. an addition to the web app's "Edit my profile" panel). This is left to the Claude Code session's design judgment during the build.

---

## 12. Cost / Free-Tier Guardrails

- Cache extraction results per page (§5) — a positive local signal on a previously-seen page should reuse the cached extraction rather than re-calling Gemini, with a reasonable expiry (offers change; content doesn't need re-checking every few minutes, but shouldn't be trusted stale indefinitely either).
- Rate-limit AI-triggering scans per user over a rolling window, so a fast-browsing session across many product pages can't exhaust the free tier in one sitting.
- If the extraction or matching call fails or the quota is exhausted, the widget should either stay silent (no recommendation) or fall back to a non-AI message, rather than erroring visibly on every page.

---

## 13. Permissions & Distribution

- Automatic background scanning requires broad host permissions (`<all_urls>` or similar) declared in the manifest — a real, known consequence of the scan-trigger decision in §10, not an oversight.
- **This build targets local/unpacked installation** (Chrome's developer mode) for now — no Chrome Web Store submission in this feature's scope. That means no store review, no hosted privacy-policy requirement, and no developer registration fee yet. Publishing is a future decision, not a Feature 2 blocker.

---

## 14. Compliance & Trust Requirements

- Advisory-only: no payment processing, no license implications, consistent with Feature 1.
- Every recommendation must trace to the user's real arsenal/financial-context data, never to which card issuer might pay a higher affiliate commission — same standing requirement as Feature 1's §13.
- Reading page content for offer detection is scoped to extracting offer/payment information only — no unrelated data collection from pages the user visits.

---

## 15. Acceptance Criteria

- [ ] Content script runs on page load, matches the signal list in §7, and escalates to an AI extraction call only on a positive match.
- [ ] Extraction results are cached per page and reused on repeat visits without a redundant Gemini call.
- [ ] A logged-in web app session is recognized by the extension automatically, with no separate login step.
- [ ] The injected widget appears near a detected offer, narrates what MIMIR is doing, and recommends one specific grounded action (a card to use, or a caution against stacking BNPL).
- [ ] The recommendation correctly reflects the user's actual card arsenal and financial context — verified by testing with two different profiles on the same page and confirming different recommendations where warranted.
- [ ] BNPL detection is badge-level only; no attempt to read cross-origin iframe content.
- [ ] The Gemini API key is never present in the extension bundle — verified by inspecting the unpacked extension's source.
- [ ] The widget is dismissible and doesn't break layout on at least a handful of real, varied shopping sites.
- [ ] The extension loads and runs via Chrome developer mode (unpacked) without requiring a Chrome Web Store submission.

---

## 16. Explicitly Deferred

- Chrome Web Store publishing (privacy policy hosting, developer registration, store review).
- Exact financial-context field format and capture flow (§11).
- Exact signal-detection pattern implementation — the list in §7 is content, not code; extend or tune it during build.
- Support for browsers other than Chrome.

---

## 17. Handoff Notes for the Claude Code Session

- Read this PRD, the Feature 1 PRD, and the Design System doc before starting — this feature reuses Feature 1's data model, AI client, and design tokens directly rather than reinventing them.
- Sections marked as a "goal" (§9) or "intentionally open" (§11) are deliberately not prescribing implementation — use engineering judgment, but check against the acceptance criteria in §15, not against any assumed internal design.
- The API-key boundary in §3 is non-negotiable: nothing Gemini-related runs inside the extension itself.
- Keep the local-scan-before-AI-call sequence in §7→§8 intact — it's the entire reason this feature is affordable to run on every page visit instead of once per session.
