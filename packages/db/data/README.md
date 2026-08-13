# Card source data

`cards.json` is a **starter set of 30 real, well-known Indian credit cards**
compiled from general knowledge of their publicly marketed terms — not
sourced from a live, current bank T&C page. Fees, reward rates, and
eligibility change over time and vary by variant/promotion.

**Before trusting this for real financial advice: verify every card's
numbers against the issuing bank's current terms page.** This set exists to
get the app running end-to-end with real card names and plausible data, not
as a substitute for the "real research/content work" PRD §7 calls for
(target scope: 100–120 cards, properly sourced).

## Role since D15 (Engineering Plan amendment)

This is no longer the primary card-recommendation source — MIMIR now scores
against a live Gemini web search by default (`apps/web/lib/mimir/
cardSearch.ts`), capped to ~20 cards and cached per profile-shape bucket.
This set is the **fallback** the seed script writes as `origin='seeded'`
rows: used only when a bucket's search fails outright or returns fewer than
`MIN_VALID_SEARCH_CARDS` citation-backed cards (`resolveCardSet.ts`) — by
design a rare path, not the everyday one. Keeping this set at ~30 well-known
cards (rather than the original 15) gives that fallback enough real variety
across issuers/tiers/networks to still be a credible recommendation set on
its own, not just a stub.

Re-run `pnpm db:seed-cards packages/db/data/cards.json` after editing this
file — the script diffs against what's stored and only updates rows that
actually changed (see `scripts/cardDiff.ts`).
