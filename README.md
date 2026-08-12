# PERQ

An AI financial advisor for Gen Z Indians, reasoning across every way a purchase can be paid for — credit cards, BNPL, cash/UPI — personalized to the user's actual financial picture. Powered by one named AI agent, **MIMIR**.

This repo currently builds **Feature 1: Card Recommender** — a one-time onboarding quiz that captures a user's spend pattern and existing cards, then returns a ranked, MIMIR-explained set of credit card recommendations. It's the foundation Feature 2 (Chrome extension) and Feature 3 (goal-based advisor) will be built on top of later.

## Docs

Read in this order before making changes:

1. [`PERQ_New_Handbook.md`](./PERQ_New_Handbook.md) — full product context, all three planned features, business model, brand positioning.
2. [`PERQ_Feature1_PRD.md`](./PERQ_Feature1_PRD.md) — the spec for Feature 1. Source of truth for scope, data model, tech stack, acceptance criteria.
3. [`PERQ_Design_System.md`](./PERQ_Design_System.md) — locked design tokens, voice, component conventions.
4. [`PERQ_Feature1_Engineering_Plan.md`](./PERQ_Feature1_Engineering_Plan.md) — locked architecture (eng review + design review, both CLEAR). Build order follows its T1–T21 task list.
5. [`TODOS.md`](./TODOS.md) — deferred work, not forgotten.

## Tech stack

Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Postgres via Neon, Drizzle ORM, Auth.js, Google Gemini API, Turborepo + pnpm workspaces. See the PRD §3 for details.

## Repo structure

```
apps/
  web/            Next.js app — all of Feature 1's UI and routes
packages/
  ui/             shadcn/ui-based components, themed with design tokens
  design-tokens/  Colors, type scale, spacing
  db/             Drizzle schema, migrations, Neon client, card seed script
  scoring-engine/ Card-ranking logic — pure, testable, reused by Feature 2/3
  ai/             Gemini client, MIMIR's tool-calling agent logic
  config/         Shared tsconfig/eslint/prettier
```

## Status

Building Feature 1 against the Engineering Plan's T1–T21 task list.
