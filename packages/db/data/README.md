# Card source data

`cards.json` is a **starter set of 15 real, well-known Indian credit cards**
compiled from general knowledge of their publicly marketed terms — not
sourced from a live, current bank T&C page. Fees, reward rates, and
eligibility change over time and vary by variant/promotion.

**Before trusting this for real financial advice: verify every card's
numbers against the issuing bank's current terms page.** This set exists to
get the app running end-to-end with real card names and plausible data, not
as a substitute for the "real research/content work" PRD §7 calls for
(target scope: 100–120 cards, properly sourced).

Re-run `pnpm db:seed-cards packages/db/data/cards.json` after editing this
file — the script diffs against what's stored and only updates rows that
actually changed (see `scripts/cardDiff.ts`).
