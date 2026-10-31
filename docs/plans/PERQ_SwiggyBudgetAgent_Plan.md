# PERQ — Swiggy Budget Agent: Build Plan

*Working plan for the investor-demo feature, locked via discussion on 2026-08-25. Companion to
`PERQ_RealSpend_CardManager_Plan.md` — this feature reuses that plan's statement-parsing pipeline as its
resilient data source, rather than duplicating it.*

Status: Locked scope, one open item (exact demo date — see §8)

---

## 1. What this is

A budget-tracking + assisted-ordering feature across Instamart, Dineout, and Swiggy Food, extending PERQ
from "which card should I use" into "help me stay inside my food/delivery budget and place the order when
it fits." Locked positioning: **PERQ never holds or moves the user's money.** Every order is placed
through the user's own Swiggy account, via Swiggy's own OAuth, charged to the user's own linked payment
method. PERQ tracks and advises; it never has custody. This is a hard requirement, not a preference — it's
the only way this feature stays consistent with PERQ's own "advisory only, no payment processing" moat
that everything else in the product is built around (see `PERQ_Product_Reference.md` §11).

**Two independent halves, deliberately decoupled:**

1. **Budget tracking (resilient, ships regardless of any external approval).** Reuses the statement-parsing
   pipeline from `PERQ_RealSpend_CardManager_Plan.md` — real transactions already being extracted from real
   bank/card statements — filtered to Instamart/Dineout/Swiggy merchant charges, rolled up against three
   separate user-set budgets. Zero dependency on Swiggy granting any access. Fully real data, works today.
2. **Assisted ordering (opportunistic, gated behind Swiggy's approval).** Swiggy's MCP (~18-49 tools across
   3 servers: Food, Instamart, Dineout) lets an agent browse/build a cart/place an order against the user's
   *own* authenticated Swiggy account. Access requires applying to Swiggy's "Builders Club" program — an
   invite-led review, not instant self-serve — with no published approval timeline. **Apply today
   regardless of anything else in this plan; it's pure lead time either way.**

---

## 2. Locked decisions

| Decision | Locked answer |
|---|---|
| Fund custody | Tracking only. Money always moves through the user's own Swiggy account, never PERQ. |
| Order autonomy | Always user-confirmed. MIMIR builds/suggests, never places an order unprompted. |
| Confirmation surface | Inside PERQ's own UI — a "Place this order" action, not a handoff to Swiggy's app. |
| Budget structure | Three separate budgets — Instamart, Dineout, Swiggy Food — not one pooled number. |
| Spend-tracking source | Statement-parsing pipeline (resilient, real, approval-independent) is the source of truth for "budget remaining." Swiggy MCP order history, if/when access lands, is a bonus richer signal layered on top — never a dependency. |
| Integration scope | Full integration into the existing PERQ app — same auth, same DB, same design system as Feature 1/3. |

---

## 3. Data flow

```
                    RESILIENT HALF (ships regardless of Swiggy approval)
                    ────────────────────────────────────────────────────
real_transactions          ┌──────────────────────────────┐
(from statement    ───────▶│ filter: merchant matches      │
pipeline, already          │ Instamart / Dineout / Swiggy  │
being built)                └───────────────┬───────────────┘
                                            ▼
                              roll up against category_budgets
                              (3 rows/user: instamart, dineout,
                               swiggy_food — each with a user-set
                               monthly/weekly limit)
                                            │
                                            ▼
                         "₹1,200 of ₹3,000 Instamart budget
                          left this month" — real, always available


                    OPPORTUNISTIC HALF (gated on Builders Club approval)
                    ─────────────────────────────────────────────────────
                    ┌───────────────────────┐
   User connects    │ OAuth 2.1 + PKCE       │
   their own    ───▶│ against Swiggy's       │  tokens stored per-user,
   Swiggy account   │ discovery endpoints    │  5-day expiry, re-auth on 401
                     └───────────┬───────────┘
                                 ▼
                    User asks MIMIR to help order
                    within a category (e.g. "order dinner,
                    I've got ₹400 left on Swiggy this week")
                                 │
                                 ▼
                    MCP tool calls: browse/search →
                    build cart (bounded by remaining
                    budget from the resilient half above)
                                 │
                                 ▼
                    Cart shown inside PERQ's own UI —
                    "Place this order" button, user taps
                                 │
                                 ▼
                    MCP order-placement call — charged to
                    the USER's own linked Swiggy payment
                    method, never touches PERQ
                                 │
                                 ▼
                    Order recorded; resilient-half budget
                    ledger updates (still trusts statement
                    data as ground truth on next reconcile,
                    this is a same-session optimistic update)
```

---

## 4. `packages/*` and `apps/web` boundaries

```
apps/web/
├── lib/
│   ├── statements/                    (existing, from idea 2's plan — unchanged)
│   └── swiggy/                        new — Feature-specific, mirrors lib/goals, lib/statements
│       ├── mcpClient.ts               OAuth 2.1+PKCE flow, token storage/refresh,
│       │                              generic MCP tool-call wrapper
│       ├── budgetLedger.ts            filters real_transactions by merchant,
│       │                              rolls up against category_budgets
│       ├── orderAssist.ts             cart-building + placement orchestration,
│       │                              bounded by budgetLedger's remaining figure
│       └── fallback.ts                what the UI shows when Builders Club
│                                      access isn't live yet (see §6)
└── app/
    ├── budgets/                       new — set/edit 3 budgets, see remaining,
    │                                  connect Swiggy account, order-assist UI
    └── api/swiggy/                    oauth callback, mcp proxy routes

packages/db/  — + category_budgets(userId, category, limitAmount, period),
                + swiggy_connection(userId, tokens, expiresAt) [only if/when
                  Builders Club access lands — no need to build this table
                  before then]
```

---

## 5. Milestones (sequenced by dependency, not fixed days — see §8 for why)

**M0 — today, unconditional.** Apply to Swiggy Builders Club (`mcp.swiggy.com/builders`). Zero cost to
start immediately; this is the longest, least-controllable pole in the whole plan.

**M1 — budget data model + UI.** Three budgets (Instamart/Dineout/Swiggy), set/edit, no Swiggy dependency
at all.

**M2 — wire the statement pipeline's output into the budget ledger.** Filter `real_transactions` by
merchant name into the three categories. This is an extension of idea 2's pipeline, not new extraction
work — same real data, new consumer.

**M3 — budget-remaining dashboard + nudge copy** ("₹1,200 of ₹3,000 left on Instamart this month"). Fully
real, fully demoable, zero dependency on Swiggy approval. **This alone is a legitimate, honest investor
demo moment even if M4 never lands.**

**M4 — conditional on Builders Club approval landing before the demo.** OAuth connect flow, MCP client,
cart-building + user-confirmed ordering, wired into the budget ledger from M2/M3.

**M6 — fallback presentation, only needed if M4's approval hasn't landed by demo time.** M1-M3 are shown
live and real. The ordering capability is presented honestly as built-and-designed, pending Swiggy's
partner approval — walk investors through the real UI/flow as a rehearsed walkthrough rather than a live
call. "We're in Swiggy's Builders Club review, here's the flow we've built for the moment it clears" is a
credible, verifiable claim to make to investors — not a weaker story than a live call, just a different one.

---

## 6. Risks

| Risk | Handling |
|---|---|
| Builders Club approval doesn't land before the demo | M6 fallback — M1-M3 are still a real, working, honest demo on their own. |
| Approved access turns out to be COD-only / unreliable checkout (per the one independent Jan 2026 test found) | Unknown until approved — M6's rehearsed-walkthrough framing absorbs this too if live checkout doesn't actually work reliably. |
| Statement pipeline (idea 2) isn't finished/available yet | M2/M3 have a hard dependency on idea 2's pipeline existing — sequence idea 2's build first, or in parallel with enough lead time. |
| Merchant-name matching misses a real Instamart/Dineout/Swiggy charge (different naming on different banks' statements) | Keep the merchant-match list loose/fuzzy and testable against the same real statements already being collected for idea 2 — same real data, just being asked a second question of it. |
| A budget nudge fires on stale data (statement not re-uploaded recently) | Show the "as of" date on the budget dashboard plainly — never imply real-time precision the data doesn't have. |

---

## 7. NOT in scope

- Any custody, holding, or disbursement of user funds — never, per §2.
- Autonomous/unconfirmed ordering — never, per §2.
- New Swiggy DB tables/OAuth work before Builders Club access is actually granted (§4 note).
- A pooled single budget — three separate ones, locked.
- Swiggy order history as the *primary* spend-tracking source — statement data is primary, MCP is bonus.

---

## 8. Open item

**The exact investor demo date is still unconfirmed.** Everything above is sequenced so it's useful either
way — M1-M3 are the honest floor regardless of timeline, M4 is upside if Builders Club clears in time. Once
you have a real date, the only thing that changes is how hard we push on M4 vs. planning M6 as the actual
presentation from the start.
