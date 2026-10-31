# PERQ — Real-Spend Card Manager: Build Plan

*Working plan for the course submission, locked via discussion on 2026-08-25. Companion to the existing
`PERQ_Feature1_PRD.md`/`PERQ_Feature1_Engineering_Plan.md` — this feature reuses their scoring engine, AI
client, and DB, and follows the same doc conventions. Scoped to a hard 1-week deadline.*

Status: Locked scope, ready to build
Timeline: ≤1 week from 2026-08-25

---

## 1. What this is

The Feature 1 quiz asks users to self-report spend in buckets ("food delivery: ₹3-6k/month"). This feature
replaces that estimate with a user's **real, parsed transaction history** for 2-3 real test users (you +
friends/family), sourced from their own real bank/card statement PDFs — not mock data, not a hardcoded
demo dataset. It powers two things from one shared pipeline:

1. **A real-spend-driven recommendation** — `scoreCards` runs against actual category spend instead of
   quiz-bucket estimates.
2. **Three real nudges** ("the Copilot" from the original pitch), computed off the same parsed data.

No Account Aggregator, no banking license, no mock data. See the discussion log for why: real AA data
access requires the requesting entity to already be a regulated financial entity (RBI/SEBI/IRDAI/PFRDA) —
there is no lightweight/sandbox-with-real-banks tier available to a student project. A user handing you
their own downloaded statement needs no license at all, because nothing is being requested *from* a bank —
this is exactly the "Onboarding Fallback" your own `PERQ_Product_Reference.md` §12 already named.

**Explicitly dropped from scope:** the Expiry Alert (reward-points-expiring nudge). No bank exposes points
balance on a statement — this was already flagged as the weakest technical assumption in your own docs, and
faking it would violate the "no mock data" requirement. Not built, not faked.

---

## 2. Data flow

```
Real user's own       ┌─────────────────────────┐
statement PDF    ────▶│ POST /api/statements/    │
(HDFC/ICICI/SBI/       │      upload              │
 Axis, text or         │  (requireAuth, reused)   │
 scanned)              └───────────┬──────────────┘
                                    │
                        Gemini structured extraction
                        (PDF as inline data part —
                         reuses packages/ai's schema-
                         constrained extraction pattern,
                         same "never invent, drop what
                         can't be verified" discipline
                         as cardSearchSchema.ts)
                                    │
                        zod validation against
                        REAL_TRANSACTION_SCHEMA
                        (date, merchant, amount,
                         category — 8-category
                         taxonomy, same as scoreCards)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          Any field fails validation        Valid transaction
          → drop that transaction             → redact, persist
          (never partially-nulled,             minimal fields only
           never guessed)                       (see §4)
                    │                                │
                    └───────────────┬────────────────┘
                                    ▼
                     raw PDF discarded immediately
                     after extraction — never persisted
                                    │
                                    ▼
                  real_transactions rows written
                  (redacted: no account number,
                   no IFSC, no PAN — see §4)
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
        scoreCards(realSpend,   Nudge compute     Nudge compute
        cards) — real-spend     (spend-concen-    (best-card-per-
        recommendation,         tration +         transaction
        same engine as          fee-waiver        retrospective)
        Feature 1, new input    threshold)
```

---

## 3. Extraction schema

```ts
// apps/web/lib/statements/extractionSchema.ts
const REAL_TRANSACTION_SCHEMA: ResponseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      date: { type: "string" },          // ISO date
      merchant: { type: "string" },       // e.g. "Swiggy", "Amazon" — not sensitive, keep
      amount: { type: "number" },
      category: { type: "string" },       // must map to one of SPEND_CATEGORIES
    },
    required: ["date", "amount", "category"],
  },
};
```

Extraction prompt instructs the model explicitly: extract only date/merchant/amount/category-inferrable-
fields; **never extract or echo account number, IFSC, card number, PAN, or any authentication data**, even
if visible in the source PDF. This is a prompt-level redaction *and* a schema-level one (the schema has no
field for those values at all, so even a non-compliant model response can't smuggle them through validation).

Category inference maps merchant/description text to the existing 8-value `SpendCategory` taxonomy
(`dining`, `travel`, `hotels`, `fuel`, `groceries`, `ecommerce`, `utilities`, `general`) — the same one
`cards.rewardRates` already uses, so no new taxonomy is introduced.

---

## 4. Data handling (locked)

- **Never extracted, ever:** account number, IFSC, card number, PAN, any OTP/auth data. Not a storage
  policy — the model is never asked to produce these fields, and the schema has no slot for them.
- **Raw PDF:** processed in memory, discarded immediately after extraction succeeds or fails. Never written
  to disk or DB.
- **Persisted:** `real_transactions(id, userId, date, merchant, amount, category, createdAt)` only.
- **Consent:** each of the 2-3 real test users is a knowing participant giving you their own data for a
  named course project — worth a one-line written consent (even a text message) confirming they understand
  what you're doing with it, given DPDP's consent principle applies to real identifiable people regardless
  of scale.

---

## 5. `packages/*` and `apps/web` boundaries (mirrors Feature 1/3's pattern)

```
apps/web/
├── lib/
│   └── statements/                   new — Feature-specific, mirrors lib/goals
│       ├── extractionSchema.ts       §3
│       ├── extractStatement.ts       PDF → Gemini extraction → validated transactions
│       ├── redact.ts                 belt-and-suspenders strip of any sensitive-looking
│       │                             field that slips through (defense in depth)
│       ├── computeRealSpend.ts       aggregates real_transactions into per-category
│       │                             totals, in scoreCards' input shape
│       └── nudges/
│           ├── spendConcentration.ts     P1 — pure transaction data
│           ├── bestCardRetrospective.ts  P1 — transaction data + existing scoreCards
│           └── feeWaiverThreshold.ts     P1 — transaction data + cards.feeWaiverCondition
└── app/
    ├── statements/                   new — upload page, real-spend results page
    └── api/statements/upload/        route: auth → extract → validate → redact →
                                       persist → recompute

packages/ai/    — extended: one new function accepting a PDF as an inline-data part,
                  reusing extractJsonWithFallback's schema-constrained-extraction shape
packages/scoring-engine/ — unchanged; computeRealSpend just produces its existing input shape
packages/db/    — + real_transactions table
```

---

## 6. Priority (P1 must-ship vs P2 stretch)

**P1 — must ship:**
1. Extraction pipeline (statement PDF → validated, redacted real transactions) working across at least one
   real user's real statement end to end.
2. Real-spend recommendation (`scoreCards` on real data instead of quiz buckets).
3. Spend-category concentration nudge.
4. Best-card-per-transaction retrospective nudge.
5. Fee-waiver threshold nudge — **contingent on Day 0's data-gap check (§7) passing** for the specific real
   cards your test users hold. If that check fails and can't be closed same-day, this drops to P2 without
   argument — it cannot work without the underlying fee-waiver figure, no matter how good the parsing is.

**P2 — build only if P1 lands with time to spare:**
- Recurring/subscription charge detector.
- Extending beyond 1 bank format if only one test user's data arrives in time.
- Any UI polish beyond "clearly works, not embarrassing."

---

## 7. Day-by-day (1 week from 2026-08-25)

| Day | Focus |
|---|---|
| **Day 0 (today)** | Get real statement PDFs from all 2-3 test users. Confirm the *exact* real cards each holds. **Fail-fast check:** query `cards` for those exact cards' `fee_waiver_condition` — if missing, backfill same-day (manual entry from the card's public T&C is fine; this is a data-completeness task, not engineering) or the fee-waiver nudge drops to P2 immediately, not on day 5. |
| **Day 1** | Build `extractStatement.ts` + schema + redaction. Test against the first real PDF that arrived. |
| **Day 2** | `real_transactions` table + persistence. Iterate extraction against a 2nd/3rd real PDF (different bank format) — this is where format variety actually gets tested. |
| **Day 3** | `computeRealSpend.ts` → wire into `scoreCards`. Build spend-concentration + best-card-retrospective nudges (P1, no extra data dependency). |
| **Day 4** | Fee-waiver threshold nudge (P1, contingent on Day 0). New minimal UI: upload flow + real-spend results page showing recommendation + all 3 nudges. |
| **Day 5** | End-to-end pass with all 2-3 real users' real data. Fix parsing edge cases (scanned pages, unusual layouts). If time remains: recurring-detector (P2). |
| **Day 6 (buffer)** | Demo rehearsal. Handle any nudge that can't compute honestly (a visible "not enough data for this" state, not a silent gap or a fabricated number) — consistent with how the rest of PERQ already handles degraded states. |

---

## 8. Edge cases / risks

| Risk | Handling |
|---|---|
| A statement PDF is a scanned image, no text layer | Gemini's multimodal input handles this natively (it reads the image, not just text) — flag as a thing to verify on Day 1, not assumed to just work. |
| A test user's real card isn't in the seeded/searched card catalog at all | Falls back to D15's existing live web-search card sourcing (already built for Feature 1) — not new work, just needs to actually run for that card. |
| Extraction returns 0 valid transactions from a real statement | Show an honest "couldn't read this statement" state — never block, never fabricate, matches the whole codebase's existing fallback discipline. |
| Fee-waiver figure genuinely unavailable even after Day 0's backfill attempt | That nudge is cut from the demo for that specific user's card, stated plainly if asked — not faked. |
| A test user backs out / statement doesn't arrive in time | Proceed with however many real users actually delivered data (1 is still real, still valid) — never substitute a synthetic one to hit "3." |

---

## 9. NOT in scope (1-week cut)

- Expiry alert (§1 — dropped, not derivable from statement data).
- Recurring/subscription detector unless P1 lands early (§6).
- More than the 2-3 initially confirmed real test users.
- Any AA/live-bank-linking work — off the table entirely per §1's finding.
- Production-grade UI polish, mobile responsiveness pass, broad bank-format coverage beyond what your
  actual 2-3 test users' banks require.
