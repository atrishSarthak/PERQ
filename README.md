# PERQ

An AI financial advisor for Gen Z Indians, reasoning across every way a purchase can be paid for, personalised to the user's actual financial picture. Powered by one named AI agent, **Ember**.

The current build is **Step 0 (foundation)** and **Step 1 (Card Recommender v2)**: a 7-question quiz, a 40-card catalogue checked on the banks' own pages, ₹/year values computed by a tested finance engine, and Ember explaining the result. It runs as an Expo app (iPhone via Expo Go) and on the web, including a public no-login card finder.

## Start here

- [`docs/RUNNING.md`](./docs/RUNNING.md): run it locally and open it on your iPhone.
- [`docs/specs/PERQ_Handoff_Step0_Step1.md`](./docs/specs/PERQ_Handoff_Step0_Step1.md): the spec for the current build.
- [`docs/DECISIONS.md`](./docs/DECISIONS.md): every judgement call made while building it.
- [`docs/AUDIT.md`](./docs/AUDIT.md): repo audit, plus code retired and waiting for deletion.
- [`packages/db/data/CARDS_README.md`](./packages/db/data/CARDS_README.md): the 40 cards, with source links.

## Repo structure

```
apps/
  web/              Next.js: landing + public card finder, all API routes
  mobile/           Expo (Expo Router): the PERQ app
packages/
  ai/               Ember runner (runEmber), tool registry, Gemini client, grounding checks
  finance-engine/   pure money math (rewards, caps, fees, GST, leakage)
  scoring-engine/   card ranking (recommend), built on finance-engine
  db/               Drizzle schema, migrations, card catalogue + seed script
  design-tokens/    tokens.ts → Tailwind preset (web) + theme (mobile)
  shared/           zod schemas and types shared by web and mobile (quiz, cards, API)
  ui/               web components
  fetch/            retired Feature 3 helper (to delete)
  config/           tsconfig bases
docs/
  specs/            build handoffs
  product/          handbook, PRDs, engineering plans, design system
  plans/            plans for upcoming features (Card Manager, Swiggy, budget assistant)
  design-reference/ approved design mockups
  assets/           brand images
  prompts/          session prompts used to drive builds
```

## Common commands

```
pnpm install
pnpm db:migrate && pnpm db:seed-cards
pnpm dev:web          # Next.js on 0.0.0.0:3000
pnpm dev:mobile       # Expo; scan the QR with the iPhone Camera
pnpm test             # all unit tests
pnpm eval             # live Ember eval (uses Gemini quota)
```

Product background: [`docs/product/PERQ_New_Handbook.md`](./docs/product/PERQ_New_Handbook.md). Deferred work: [`docs/TODOS.md`](./docs/TODOS.md).
