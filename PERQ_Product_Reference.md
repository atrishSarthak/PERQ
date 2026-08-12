# PERQ — Product Reference Document

*India's Credit Card & Personal Finance Intelligence Platform*

This document is the working reference for what PERQ is, why it matters, and what we are building. It consolidates the original Canva deck content with the follow-on product strategy discussion, so it can be used as a single source of truth for scoping the actual build (app/web app/extension) for the FinTech course project.

---

## 1. The Core Idea

PERQ is a neutral, wallet-aware financial copilot. It tells users which card to use, when, and why — and increasingly, what to do with the money they save. It is explicitly **not** a search engine and **not** a card-issuer sales channel. It is positioned as the only advisor in the market with no card-issuer bias.

One product, three surfaces:

- **Chrome Extension** — the differentiator. Lives in the browser, at the moment of purchase.
- **App** — card intelligence on the go (alerts, quick recommendations).
- **Website** — the full research/compare/decide experience.

---

## 2. The Problem

India handed 114 million+ people a financial superpower (credit cards) faster than the advisory infrastructure could keep up. The card-use decision shifted from an annual choice (which card to get) to a daily one (which card to use, right now) — and nothing helps with the daily decision.

This is framed deliberately as **an information architecture problem, not a financial literacy problem.**

**Supporting data:**

- Credit card transactions doubled in 5 years: 208 Cr → 447 Cr monthly (RBI Payment System Indicators, 2024–25)
- 16 million new credit cards issued every year (PwC India Credit Card Market Report, FY2023–24)
- ₹2.17 lakh crore spent on credit cards in a single month (RBI Monthly Data, September 2025)
- ₹3,000 lost per user, per month, in unrealised rewards
- 70% of card users fail to optimise rewards
- 2/3 of all earned points expire unused every month

**Two user archetypes, one shared problem:**

- **Archetype A — The New Card Seeker**: trying to pick their next card.
- **Archetype B — The Existing Cardholder**: already holds cards but defaults to using the same one (~87%) regardless of what's optimal for the purchase.

---

## 3. Market Sizing

- **TAM**: 114M+ existing credit cardholders + 16M new cards/year = the entire Indian credit card user base.
- **SAM**: ~65% say they'd switch for better rewards ≈ 70–75 million users actively seeking advisory.
- **SOM**: Digitally active, Tier-1, rewards-aware users. Target 2–5 million users — conservative, credible, achievable starting point.

---

## 4. Why Nothing Today Solves This

| Existing option | Why it fails |
|---|---|
| BankBazaar | Goes silent the moment you apply. No ongoing advisory, no wallet awareness. |
| Google / ChatGPT | Gives market answers, not *your* answer. No wallet context, stale data. |
| Your Bank's App | Will never recommend a competitor's card. Advisory = sales pitch, structural conflict of interest. |
| CRED | Only optimised for CRED's own ecosystem. Incentivised to keep you inside their app. |

PERQ's structural difference: it has no card-issuer bias, and that's the entire moat.

---

## 5. The Proactive Copilot Layer

Three things PERQ does without being asked — this is the core product feel, not just a feature list:

1. **Expiry Alert** — "Your 4,200 reward points expire in 12 days. Here's how to use them."
2. **Threshold Nudge** — "You are ₹2,000 away from your HDFC fee waiver this month. One more grocery run covers it."
3. **In-Context Recommendation** — User opens BookMyShow. Before they even look at offers: "Use your Axis Atlas. 15% cashback · saves ₹240." (Chrome Extension)

The user doesn't ask, doesn't check, doesn't switch tabs. PERQ is already there.

---

## 6. Business Model

Trust-first, deliberately structured so PERQ never has an incentive to recommend a worse card:

1. **Affiliate Commissions** — Bank pays ₹500–₹2,500 per approved card via PERQ. No bias: best card, not highest commission (needs an explainability mechanism to hold up under scrutiny — see Section 9).
2. **Subscription** — Advanced features: portfolio analytics, proactive expiry alerts, monthly savings report, spend category optimisation.
3. **Bank Partnerships (Scale)** — Aggregated, anonymised insights for issuers. Revenue comes later, after trust is built.

---

## 7. Compliance & Data Strategy

- **Account Aggregator Framework (RBI, 2021)** — For transaction data access at scale, users consent through a licensed AA. PERQ operates as a Financial Information User (FIU). No banking licence required for this role.
- **No RBI licence required at MVP stage** — PERQ is an information/advisory service. Not a payment processor, not a lending platform, not a payment aggregator.
- **Digital Personal Data Protection Act 2023** — User consent required before any data collection. Minimum data collected for maximum value. Users can delete their profile anytime.

**Consent-based data flow:**

1. User links bank/card accounts → PERQ requests specific data access → user approves via licensed AA → consent revocable anytime.
2. End-to-end encrypted flow. AA cannot read/store raw data. PERQ gets data only for the approved purpose.
3. Go-to-market requirement: partner with a licensed Account Aggregator, register as FIU, build RBI/compliance-grade data handling and consent architecture.

---

## 8. Anticipated Objections (from the deck)

- **"Isn't this just ChatGPT?"** — ChatGPT knows the market. PERQ knows your wallet.
- **"Do you store sensitive card data?"** — Never. Card names only ("Axis Atlas" is a preference, not financial data). No PAN, no CVV, no account details, ever.
- **"What about RBI regulations?"** — PERQ is advisory, not a payment processor. No RBI banking licence required at MVP stage.
- **"Are you a one-time service?"** — No. Archetype A converts into Archetype B after getting a card. PERQ then watches their wallet, alerts before points expire, guides daily card choice. Points expire monthly — so does the value PERQ delivers, which is exactly why it has to keep showing up.

---

## 9. Startup-Level Assessment (Honest Take)

**Why it works:**

- Real regulatory tailwind — the AA framework (2021) and DPDP Act (2023) already provide the legal rail PERQ needs. Most fintech ideas fight regulation; this one rides existing infrastructure.
- The "no issuer bias" wedge is genuinely defensible — BankBazaar, CRED, and bank apps are all structurally conflicted. PERQ isn't.
- The Chrome Extension is a smart distribution and retention mechanism — in-moment nudges beat app-based advisory that people forget to open.
- The expiry-alert retention loop directly solves fintech's classic "downloaded once, never opened again" problem.

**Where it's weaker — needs to be addressed, not ignored:**

- The affiliate model claims "no bias," but affiliate income is structurally a bias risk. This needs a visible explainability mechanism ("why this card was recommended") to survive scrutiny.
- Full AA integration (becoming a registered FIU, onboarding banks) is a heavy, multi-month lift — not MVP-speed work.
- Real-time reward-points data isn't reliably exposed by most banks even through AA rails. This is the single weakest technical assumption in the current plan.
- Chrome Extension coverage across many merchant sites is a real maintenance burden at scale (fine for a demo, not trivial at scale).
- Competitive field is real and closing in: CRED, Fi Money, Jupiter, Cheq are all drifting into rewards optimisation.

---

## 10. MVP Scope Recommendation (Course Build)

To keep this buildable and demoable without needing real AA integration:

1. **Recommendation engine** — user manually adds the cards they hold; a rule engine scores best card per category (cashback %, multiplier, fee amortised). Real algorithm, not a mockup.
2. **Chrome Extension prototype** — hardcoded support for 3–4 real sites (Amazon, Flipkart, BookMyShow, Swiggy); detects the site, shows a "use card X, save ₹Y" tooltip via rule lookup.
3. **Savings dashboard** — running tally of "you saved ₹X this month," ties the whole pitch together visually.

Full AA/FIU integration stays as a documented Phase 2/3 roadmap item — not something that needs working code for the course deliverable.

---

## 11. Wealth-Tech Expansion Layer

Pure card-advisory alone risks feeling like a single-trick tool. The extension into wealth/money features should stay in "advisor / nudge" territory, not become a licensed fiduciary product — full robo-advisory (auto-invest, auto-rebalance, portfolio construction) requires SEBI Registered Investment Adviser (RIA) registration, a separate and heavy regulatory regime from the RBI/AA rail already used for the card side. That is explicitly out of scope for MVP.

**Features that extend naturally, reusing the same AA/transaction data already needed for cards:**

- **Smart Save-to-Invest Nudge** — turns detected monthly savings (e.g. ₹3,000 from card optimisation) into a direct nudge to invest via a partner SIP/mutual fund platform. Revenue via referral commission — same affiliate logic as the card model, no new licence needed since money is routed to a regulated third party rather than managed directly.
- **Credit Health Score** — utilization %, score trend, "pay down before due date" reminders. Uses the same AA account data already required for card intelligence; no new integration cost.
- **Subscription Leak Detector** — scans transaction data for recurring charges the user has likely forgotten about (unused streaming, gym apps). High "wow factor," easy to build with pattern matching on recurring debits.
- **Goal-Based Nudging** — "Save ₹5,000 toward Trip Y — you're ₹1,200 behind pace." Powered by the same spend categorisation already needed for card recommendations.
- **AI Chat Advisor layer** — an LLM wrapper over PERQ's own rule engine and partner data. User asks "should I use this card or invest the money I saved?" and gets an answer generated from existing logic. Structurally this is a recommendation UX, not licensed portfolio management — regulator-safe, and a strong technical/demo showcase (LLM integration, not just static UI).

**Explicitly out of scope — avoid scope creep into licensed territory:**

Lending/BNPL, crypto, payment processing, and direct fund management. All of these pull in heavy licensing burden (RBI NBFC, SEBI) and contradict the "pure advisor, no conflict of interest" positioning that is PERQ's core moat.

---

## 12. Product-Completeness Features (Making It Feel Like a Real Product, Not a Gimmick)

The core loop — acquire (card quiz) → retain (expiry/threshold nudges) → expand (wealth nudges, credit health) — is a real product loop. But a few structural pieces are needed before it feels like a complete, usable product rather than a slide-deck idea:

1. **Onboarding Fallback** — Manual card entry plus optional bank statement (PDF) upload/parsing as a fallback for users who aren't yet linked via Account Aggregator. AA adoption in India is still early; statement upload is the practical bridge, not glamorous but necessary for real usability.
2. **Trust & Security UX** — A visible, user-facing "why we're safe" screen, biometric/session lock, and self-serve data deletion. The deck has a strong compliance story (DPDP, AA) but no user-facing trust layer yet — this is not optional when handling financial data.
3. **Benefit / Insurance Utilization Tracker** — Surfaces bundled card benefits users forget exist (travel insurance, purchase protection, lounge access). Same neutral-advisory logic as the card nudges, zero new regulatory burden since it's purely informational, and a strong "didn't know that" demo moment.
4. **Referral / Growth Loop** — Simple refer-a-friend mechanic (both sides get a subscription discount or bonus insight). The deck currently has no answer to "how do you grow" beyond a TAM slide — this fixes that gap.

**Why these four matter:** Add onboarding fallback + trust UX + benefit tracker + referral loop and PERQ stops feeling like a slide-deck idea and starts feeling like a shippable app. Combined with the wealth-nudge layer (Section 11), these four features turn PERQ into a strong, respectable, believable full product — without scope creep into licensed territory.

---

## 13. Feature Summary Table

| Layer | Feature | Status |
|---|---|---|
| Core | Card recommendation engine (rule-based scoring) | Build for MVP |
| Core | Chrome Extension contextual nudge (hardcoded sites) | Build for MVP |
| Core | Savings dashboard | Build for MVP |
| Core | Expiry alert / threshold nudge | Build for MVP (can use mock data) |
| Growth | Card-seeker quiz (Archetype A) | Build for MVP |
| Growth | Referral / growth loop | Build for MVP |
| Trust | Trust & security UX, consent screens | Build for MVP |
| Trust | Benefit / insurance utilization tracker | Build for MVP |
| Data | Onboarding fallback (manual entry / statement upload) | Build for MVP |
| Wealth | Smart Save-to-Invest nudge | Phase 2 |
| Wealth | Credit health score | Phase 2 |
| Wealth | Subscription leak detector | Phase 2 |
| Wealth | Goal-based nudging | Phase 2 |
| Wealth | AI chat advisor layer | Phase 2 |
| Infra | Full AA/FIU integration, real bank data | Phase 2/3 roadmap only |
| Out of scope | Lending/BNPL, crypto, payment processing, direct fund management | Never (breaks core positioning) |

---

## 14. One-Line Positioning

*"PERQ manages the moments between your paycheck and your goals"* — spend-side intelligence (card optimisation) + save-side intelligence (investment nudges) + financial health (credit score, subscription audit), all delivered without ever having a financial incentive to steer the user wrong.
