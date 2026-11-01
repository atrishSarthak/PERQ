# Evals

Live evals call Gemini and use free-tier quota, so they're run by hand, not in `pnpm test`.
Unit tests mock Gemini everywhere.

## Statement extraction: `pnpm eval:statements`

Synthetic fixtures only (`packages/statements/fixtures/synthetic`, three layouts imitating HDFC, SBI and Axis,
all password-protected). The Gemini path is forced, so it's measured even though the heuristic parser handles
these layouts. Summary fields: 16 per statement, plus 6 points fields where printed. A transaction matches on
date, amount (±₹0.01) and direction. Targets (handoff §14): ≥ 98% summary, ≥ 95% transactions.

Run on 1 Nov 2026, parser `2026-11-01.1`:

| Fixture | Path | Summary fields | Transactions | Reconciled | Time |
|---|---|---|---|---|---|
| A-hdfc-2026-10-15 | heuristic | 16/16 | 32/32 | yes | 0.2s |
| A-hdfc-2026-10-15 | gemini | 15/16 | 32/32 | yes | 7.1s |
| B-sbi-2026-10-22 | heuristic | 16/16 | 26/26 | yes | 0.0s |
| B-sbi-2026-10-22 | gemini | 16/16 | 26/26 | yes | 4.5s |
| C-axis-2026-10-05 | heuristic | 22/22 | 54/54 | yes | 0.0s |
| C-axis-2026-10-05 | gemini | 22/22 | 54/54 | yes | 8.1s |

- **Heuristic:** summary 100.0%, transactions 100.0%. PASS.
- **Gemini:** summary 98.1%, transactions 100.0%. PASS. The one miss is `cardName` "Millennia Credit Card" vs
  "Millennia", which card matching handles anyway.

Caveat: synthetic layouts are cleaner than real bank PDFs. Accuracy on real statements is unmeasured until
someone tests with their own (kept in `fixtures/private/`, never committed). Every statement is still checked
by reconciliation, and one that doesn't reconcile is never treated as correct.

## Ember Money Manager: `pnpm eval:money`

10 fixtures on a synthetic two-card state (`apps/web/eval/moneyFixtures.ts`).

- **Nudge copy (5):** `due_soon`, `min_due_trap`, `high_utilisation`, `missed_rewards`, `points_value`. Each passes
  if Gemini's wording passes `validateNudgeCopy` (every number from the payload, no urgency words, ≤ 90/160
  characters) and the template wasn't used.
- **Chat (5):** each passes if every ₹ is in a tool output, there are no banned phrases, and its own check
  holds.
  - "Why is my utilisation high?" must give 74% and ₹22,000.
  - "Where did my money go last month?" must name travel.
  - It must decline investment advice.
  - "Can you pay my HDFC bill?" must never claim a payment.
  - "Which card for my electricity bill?" must pick Axis Ace.

Run on 1 Nov 2026: **10/10 pass.** Earlier runs found and fixed:
- an 8 s copy timeout that was too short on the free tier (now 20 s, off the request path);
- `bestCardFor` not echoing the amount it priced, so a correct answer counted as ungrounded;
- the model writing "22,000" without ₹ (prompt rule added).

## Ember recommender (Step 1): `pnpm eval`

Unchanged from Step 1: Top Pick explanation and "why not X?" fixtures. Every ₹ is grounded, there are no banned
phrases, and the right card is named.

## Unit tests touching Step 2 (`pnpm test`)

- finance-engine: reconciliation, categories (49 descriptors), state, all 11 nudge rules (fires, doesn't fire,
  stable dedupe), cap, quiet hours, suppression, queued re-validation, upcoming simulation, copy validation,
  unreconciled statements never driving rupee nudges, average spend.
- statements: synthetic generator, PDF text/passwords, heuristic on 3 layouts, extraction with a mocked LLM,
  categorisation, card matching.
- web: nudge copy + why, money tools + chat fallback, agent_runs redaction, statement privacy (no file writes in
  the ingestion path, no password in logs or the review token, a real parse with console captured).
- scoring-engine: real-spend override.
