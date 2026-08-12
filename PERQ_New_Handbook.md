# PERQ — New Handbook

*A working product concept, rebuilt from scratch after stress-testing the original PERQ pitch. Built iteratively, one locked feature at a time.*

---

## 1. Problem Statement

**"In the minutes before a concert ticket sells out, Gen Z has no way to know whether their own credit card, the BNPL offer on screen, or just waiting is actually the cheapest way to pay — so they default into debt."**

More broadly: Gen Z Indians increasingly face a fragmented set of ways to pay for any purchase — their own credit cards, BNPL/EMI offers at checkout, or plain cash/UPI/debit — with no single place reasoning across all of them, personalized to the individual's actual financial picture, credit history, and upcoming obligations. PERQ is positioned to be that reasoning layer: not a card-rewards calculator, not a spreadsheet, but an AI financial advisor that plans *how* and *when* you pay, across every method available to you.

**Why this version differs from the original PERQ pitch:** the original concept centered on card-vs-card rewards optimization alone — a solved problem at scale (SaveSage: 10L+ users). This version keeps card optimization as one input into a harder, genuinely differentiated question: given everything you could use to pay — cards, BNPL, cash — and everything the AI knows about your financial situation, what's actually the smartest move for *this* purchase, right now.

**Meet MIMIR — PERQ's named AI agent.** Every feature in this handbook is powered by one agent, not three disconnected tools: MIMIR (named for the Norse figure of wisdom and counsel, consulted for guidance — the mythological fit for a financial advisor is direct). All three features are MIMIR doing its job in a different context: onboarding (Feature 1), in-context on the page (Feature 2), or on a stated goal (Feature 3).

---

## 2. Target Segment

Gen Z college students and first jobbers in India. Validated by 2026 data: 62% of India's Gen Z are traveling specifically for concerts/festivals, average event-led trip cost ₹51,000, 6 in 10 willing to commit 21–40% of monthly income to music-led travel. Separately, Gen Z is documented to over-index on instant credit — 41% of India's new-to-credit borrowers are Gen Z, and "loan stacking" (taking a new loan to cover an old EMI) is a named, growing 2026 trend.

---

## 3. Feature 1 — Card Recommender ✅ LOCKED

**What it does:** A one-time onboarding module (10–15 questions, not the whole app's onboarding) capturing the user's spend pattern — flight frequency, hotel stays, gym membership, food delivery (Swiggy/Zomato), e-commerce (Flipkart/Amazon), and which co-branded cards they already hold. Output: a ranked recommendation of which card(s) to hold or use, with plain-language reasoning.

**How it works:**
- Quiz-based data capture (self-reported, no bank linking, no Account Aggregator needed).
- A rule-based scoring engine ranks cards by expected annual value: (reward rate × category spend) − annual fee + milestone bonus value, against a curated real database of ~20–30 popular Indian cards' reward structures, fees, and co-brand terms.
- An AI-generated explanation layer sits on top of the score — not just "Card X wins" but the reasoning behind it, including non-obvious tradeoffs a pure ranking would miss (e.g. flagging that a high-fee travel card isn't worth it if real spend skews toward food delivery, even if the person flies occasionally).

**Feasibility:** High. This is the most proven feature in the product — SaveSage runs this exact model at real scale (10L+ users, 700+ cards analysed). Two build components: the scoring logic (low technical risk, well-understood) and the card database (real research/content work, not hard engineering, but needs to be accurate and kept current).

**Honest limitation:** the core computation is arithmetic — same critique that applies to SaveSage. The AI explanation layer is what elevates it beyond a spreadsheet, and is cheap enough to include in MVP rather than defer.

**Compliance:** Lowest-risk feature of the three. Fully self-reported quiz data — no bank linking, no AA, no transaction access. Purely informational/advisory, no RBI licensing implications on its own. Note for later: if affiliate commissions are part of the business model, the "why" explanation must visibly stay quiz-driven, not commission-driven, to preserve the neutral-advisor positioning (full treatment under Business Model, once all features are locked).

---

## 4. Feature 2 — Chrome Extension: Offer Reader + Payment-Method Advisor ✅ LOCKED

**What it does:** PERQ lives wherever the user is shopping. On any site — not a hardcoded list — the extension detects offers and payment options, maps them against the user's card arsenal (Feature 1) and financial context, and recommends which card or payment method to actually use, skipping the manual tedium of comparing offers by hand.

**How it works:**
- Content-triggered, not site-list-triggered: a lightweight local scan (no AI call, near-zero cost) checks any page for signal words — "% off," "cashback," "EMI," "pay in installments," currency symbols. Only pages with relevant signals escalate further.
- On a positive trigger, the extension sends the visible page text/cleaned DOM to an AI model that extracts the offer and payment information by understanding meaning and layout, not fixed CSS selectors — this is what makes "works on most websites" feasible without per-site engineering, and it degrades gracefully instead of breaking outright when a page's markup changes.
- Extracted offers/payment options are cross-referenced against the user's card arsenal (Feature 1) and a lightweight self-reported financial-context profile (credit score, existing EMI/loan count) to produce a recommendation: which card unlocks the best offer, or whether credit/BNPL/cash is the smarter move right now.

**Technical constraint — holds regardless of site count:** BNPL/payment widgets (Simpl, LazyPay, etc.) typically render inside iframes from a different domain than the merchant site, for PCI-DSS security reasons. A content script cannot read across that boundary — this is a browser security wall, not a maintenance gap that more engineering closes. What's readable is the merchant page's own promotional copy about BNPL ("Pay in 3 with Simpl, no cost EMI" badges), not the live fee/interest fine print. MVP scope: badge-level BNPL detection + advice from self-reported financial context ("you already have 2 EMIs running, use your Axis card instead of stacking a third"), not real-time parsing of a specific BNPL offer's terms. Deep parsing of a specific offer's fine print is Feature 3's job, where the user deliberately provides it.

**New data requirement surfaced:** a lightweight financial-context profile beyond Feature 1's card-preference quiz — self-reported credit score (from a free CIBIL/Experian pull, which is already self-serve in India) and existing EMI/loan count. Still fully self-reported, still no Account Aggregator needed.

**Feasibility:** Medium-high. The generic AI-extraction architecture is a stronger technical story than a hardcoded site list ("works on a site we never specifically coded for" is a real demo moment) and is more current-AI-native than the original PERQ extension's DOM-scraping approach. Real engineering surface: trigger detection, extraction pipeline, recommendation UI injection. Real cost consideration for later: an AI call per relevant page visit has a small per-call cost — a unit-economics line for the business model section, not an MVP blocker.

**Compliance:** Advisory-only, no payment processing, no license needed. Using a self-reported credit score for advice is informational, not formal credit counseling — a disclaimer, not a registration requirement.

---

## 5. Feature 3 — Goal-Based Purchase Advisor ✅ LOCKED

**What it does:** The user states a goal in plain language — "I want to book a ticket to the Paris museum," "I want to book a movie ticket" — with no manual legwork. PERQ automatically checks the real channels where that purchase is possible, compares them, and returns one final recommendation covering both *where* to buy and *how* to pay: e.g. "Buy it on Klook using your Axis card" or "Book on BookMyShow using Pay Now."

**How it works:**
- Category-mapped channel shortlist: a curated set of real channels per purchase type (movie tickets → BookMyShow, District; travel/attraction tickets → Klook, GetYourGuide, the venue's official site; electronics → Amazon, Flipkart, the brand's site). Not an open-ended "search the whole internet" agent — bounded and testable.
- When a goal is stated, PERQ automatically fetches each relevant channel in that category and runs them through the same generic AI-extraction engine built for Feature 2 (reused, not rebuilt) — triggered programmatically instead of by the user's own browsing.
- Results are compared across channels, then reasoned against card arsenal (Feature 1), financial context, and billing-cycle timing (Feature 2/3 logic) to produce one final recommendation.
- Billing-cycle timing reasoning carries over from this feature's original scope: using self-reported statement/due dates to advise, e.g., waiting until after a statement closes to maximize interest-free float, or flagging utilization impact from self-reported outstanding balance and credit limit.

**Feasibility:** The full open-ended "AI agent browses the entire internet" version is real, current technology, but carries serious live-demo reliability risk (logins, CAPTCHAs, rate limits, unpredictable timing) — too risky to bet a course demo on. The category-mapped automated version delivers the identical user-facing experience (state a goal, get one final answer, zero manual pasting) while staying bounded and testable, and directly reuses Feature 2's extraction engine rather than requiring new infrastructure.

**Honest costs:** latency — multiple real fetches plus AI calls per goal, likely 10–30 seconds (can be framed in the UI as "PERQ is checking N sites for you" rather than hidden). Some sites' terms of service technically restrict automated fetching — low real-world risk for a course build, worth knowing if productized further (would need official APIs/partnerships rather than scraping at scale).

**Compliance:** Advisory-only, no new licensing triggers. Automated fetching for price comparison is a ToS consideration, not a regulatory one.

---

## 6. Compliance & Business Model Summary

**Benchmarked against:** Oolka (Dhruva), India's leading agentic-AI credit-health startup ($7M+ seed, Accel/Lightspeed/Z47-backed, 70L+ users) — closest real-world proof that "agentic, not conversational" AI is fundable and adoptable in Indian fintech. Oolka operates adjacent to PERQ (credit *repair*, not purchase-decision advisory), which makes it a strong reference model rather than a direct competitor.

**Compliance posture, stated plainly (not hedged):**
- All three features run on self-reported data (card holdings, spend pattern, self-reported credit score, self-reported EMI/loan count) or real-time data the user is already looking at (a checkout offer, a BNPL badge). No Account Aggregator integration, no bank linking, no NBFC/RBI lending license required at MVP.
- MIMIR is advisory-only across all three features: it never originates credit, never processes payment, never holds custody of funds. Every recommendation is a suggestion the user acts on themselves, in their own banking/payment apps.
- Any agentic action beyond advising (e.g. future phase — auto-applying for a recommended card, auto-initiating a dispute) would require explicit user consent at that specific step, matching Oolka's own consent-gated autonomy model. Not required for the three locked features, which stop at recommendation.

**Business model — monetize the action, not the information (Oolka's model, adapted):**
- Free: Feature 1 (card recommendation quiz) and Feature 2's basic in-context advisories — this is the acquisition layer, low cost to serve, drives habitual use.
- Paid/premium: Feature 3's multi-channel automated goal search (the highest compute cost — multiple live fetches and AI calls per query) as a subscription tier or usage-based credit system.
- Affiliate commissions on card sign-ups and channel bookings, inherited from the original PERQ model — kept honest by the same explainability requirement flagged in the original doc: MIMIR's "why this recommendation" must visibly trace back to the user's quiz/profile data, never to which partner pays more. This is the same trust mechanic Oolka relies on implicitly by being agentic rather than just monetizing eyeballs.

**Defensibility / moat narrative:** every MIMIR interaction — a quiz answer, a page it read, a goal it resolved — sharpens its model of that specific user's financial situation. Repeated use compounds personalization accuracy, the same "engagement moat" logic Oolka's founder cites for Dhruva ("data-rich loop that compounds accuracy and trust"). This is worth stating explicitly in the pitch as the answer to "what stops someone from copying this."

---

## 7. Brand & UX Principles

**Positioning line: "Agentic, not conversational."** Directly borrowed from Oolka's own framing of Dhruva, and it's the right line for PERQ too — the whole point of Features 2 and 3 is that MIMIR *does* the checking, reading, and comparing instead of telling the user to go do it themselves. Feature 1 is the exception (a quiz, inherently conversational/input-driven) and should be framed as *setup*, not MIMIR's hero moment — the hero moments are Feature 2 (reads a real page and acts) and Feature 3 (checks real channels on its own and acts).

**Show the work, don't hide it.** Oolka's numbered "reads → finds → files → drafts → tracks" format should carry directly into PERQ's actual demo and pitch, not stay confined to this handbook. Concretely: the product UI itself should visibly narrate what MIMIR is doing — "MIMIR is checking 4 sites for you," "MIMIR read this offer and found a hidden ₹200 fee" — rather than a silent spinner. This is both a trust mechanic (nothing feels like background scraping) and a demo mechanic (a professor watching the screen sees the agent working, not just a final answer appearing).

**Compliance as a confidence signal, stated up front.** Oolka puts "Is it safe?" directly on its homepage with a three-line plain-language answer. PERQ's pitch materials should do the same — self-reported data, advisory-only, no license required — stated as a feature of the design, not a defensive footnote answering an objection.

**Tone: old wisdom, young voice.** MIMIR's naming brings mythological gravitas (a figure consulted for counsel); the actual product voice should stay unmistakably Gen Z — bold, direct, a little playful, never sounding like a bank. The tension between "ancient wise oracle" and "shouts Gen Z" is deliberate, not a conflict to resolve away: MIMIR is the wise one, but it talks like it actually knows your life — concert tickets, BNPL traps, group plans — not like a financial institution.

**Named-agent consistency.** Every recommendation, notification, and in-product moment should be attributed to MIMIR by name ("MIMIR recommends...", not "PERQ recommends..." or a generic "Recommended for you") — the same consistency Oolka maintains with Dhruva, which is part of what makes the agent feel like a real product decision rather than a feature label.
