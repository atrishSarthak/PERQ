# Card source data

`cards.json` is a set of **123 real, well-known Indian credit cards across
20 issuers**, compiled from general knowledge of their publicly marketed
terms — not sourced from a live, current bank T&C page. Fees, reward rates,
and eligibility change over time and vary by variant/promotion.

**Before trusting this for real financial advice: verify every card's
numbers against the issuing bank's current terms page.** This set exists to
get the app running end-to-end with real card names and plausible data, not
as a substitute for the "real research/content work" PRD §7 calls for. It
now meets PRD §7's target scope (100–120 cards) in count, but every entry
still needs the same real-source verification pass the original 30 did —
"more cards" isn't "verified cards."

## Role since D15 (Engineering Plan amendment)

This is no longer the primary card-recommendation source — MIMIR now scores
against a live Gemini web search by default (`apps/web/lib/mimir/
cardSearch.ts`), capped to ~20 cards and cached per profile-shape bucket,
and always re-searched fresh (not served from a stale cache) the moment a
user finishes the quiz — new signup or "Retake the Quiz" — so the search
is grounded in that submission's actual context (`resolveCardSet.ts`'s
`forceRefresh`). This set is the **fallback**, written by the seed script
as `origin='seeded'` rows: used when a bucket's search fails outright,
returns fewer than `MIN_VALID_SEARCH_CARDS` citation-backed cards, or the
`GEMINI_API_KEY` is quota-exhausted (`resolveCardSet.ts`) — meant to be a
rare path, but in practice the one that fires whenever the shared API key
is rate-limited. Grown from ~30 to 123 well-known cards specifically so
that when this fallback DOES fire, it still has real variety across
issuers/tiers/networks instead of being a small, easily-exhausted stub.

Re-run `pnpm db:seed-cards packages/db/data/cards.json` after editing this
file — the script diffs against what's stored and only updates rows that
actually changed (see `scripts/cardDiff.ts`).
