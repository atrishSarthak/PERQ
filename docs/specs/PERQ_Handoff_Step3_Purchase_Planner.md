# PERQ: Build Handoff, Step 3 (Purchase Planner: "Should I buy this?")

*For a Claude Code session working in the PERQ monorepo after Steps 0, 1 and 2 are complete. Read this whole file before writing code. `docs/PERQ_Handoff_Step0_Step1.md`, `docs/PERQ_Handoff_Step2_Money_Manager.md`, `docs/AUDIT.md` and `docs/DECISIONS.md` still apply. Where this file and existing code disagree on a small detail, keep the code and note it in DECISIONS.md. Where they disagree on something marked **Locked**, follow this file.*

Last updated: 2026-11-01

---

## 1. What "done" looks like

On an iPhone through Expo Go:

1. From Home ("Should I buy this?"), from the Ember chat ("Can I get the ₹45k phone?"), or by adding a screenshot of a product page, the user starts a purchase plan.
2. They confirm the item, price and any offers (typed, or read from the screenshot).
3. Ember works through the plan step by step on screen: budget, cards, statement dates, credit limit, EMI cost.
4. They get **one answer** with a verdict, the card to use, the best day to buy, whether to pay in full or by EMI, and a breakdown of every number.
5. One tap sets a reminder for the best day, starts a savings goal, or saves the plan.
6. On the reminder day, a nudge arrives ("Good day to buy the phone: your HDFC statement closed yesterday, so you get 49 interest-free days").
7. When a later statement shows the purchase, Ember asks to mark the plan as bought.

The planner is an **Ember task**, not a separate product. It reuses the Money Manager's financial state, the recommender's card catalogue, and the nudge engine.

---

## 2. Ground rules (Locked)

All earlier rules still apply: code computes and the LLM reasons, secrets server-side, shared logic in `packages/*`, no dark patterns, everything runs in Expo Go, injectable clock. Added for this step:

- **Every number in the answer comes from `packages/finance-engine`.** The verdict itself is decided by deterministic rules (Section 5.6). Gemini writes the wording only.
- **Never analyse unconfirmed numbers.** If the price or offers came from a screenshot or a chat message, the user sees and confirms them before the plan runs.
- **No scraping.** Do not fetch Amazon, Flipkart or any shop page from the server. A pasted link is used only to read the merchant and a rough product name from the URL itself.
- **Advice is about paying, not about whether the thing is worth owning.** Ember never judges the user's choice of item. It talks about affordability, timing, cards, EMI cost and credit health.
- **Missing data is said out loud.** If there are no statements, no cards or no budget, the answer still works but names what it couldn't check.
- **Ember's permission levels hold.** Planning is level 1. Setting a reminder is level 2 (user taps). Creating a goal is level 3 (Ember proposes, user confirms). Nothing here is level 4 or 5.

---

## 3. Scope

**In scope:** plan input (typed, chat, screenshot, pasted link), price and offer confirmation, the planning engine (affordability, best card with offers, timing, utilisation, EMI vs full payment), verdict rules, Ember narration and explanation, plan actions (remind, goal, save), plan history, a new nudge rule, automatic "did you buy it?" matching from statements, tests and evals, demo scenarios.

**Shared with the Chrome extension:** `rankPaymentOptions` and `emiTrueCost` are built here and must be usable as-is by `/api/extension/analyze` later (see `docs/PERQ_Chrome_Extension_Integration_Guide.md`). Build them with that second caller in mind.

**Out of scope:** the Chrome extension itself, Android/iOS share-sheet extensions (they need a dev build, not Expo Go; leave a TODO), price comparison across shops, Swiggy, buying on the user's behalf.

---

## 4. Data model

```
purchase_plans
  id, user_id,
  item_name, category,                  -- category uses the Step 2 list
  price,                                -- int ₹, confirmed by user
  merchant (nullable), source ('typed'|'chat'|'screenshot'|'link'),
  need_by_date (nullable),
  offers jsonb,                         -- confirmed offers, OfferSpec[] (5.2)
  emi_options jsonb,                    -- confirmed EMI choices, EmiSpec[] (5.4)
  inputs_snapshot jsonb,                -- state values used (budget left, cards, dates)
  result jsonb,                         -- PlanResult (5.7)
  verdict ('go'|'go_with_timing'|'wait'|'rethink_payment'),
  explanation, explanation_source ('ai'|'template'),
  status ('draft'|'planned'|'reminder_set'|'bought'|'dropped'|'expired'),
  remind_at (nullable), matched_transaction_id (nullable),
  agent_run_id, created_at, updated_at
```

Reused: `goals`, `nudges`, `chat_messages` (thread_ref `plan:<id>`), `activity_events`, `agent_runs`, `financial_state_cache`.

---

## 5. The planning engine (`packages/finance-engine/planner/`)

Pure functions, each with Vitest tests. All money in integer rupees, all dates in IST, `now` passed in.

### 5.1 Inputs

```ts
interface PlanInput {
  item: { name: string; category: Category };
  price: number;
  merchant?: string;
  needBy?: Date;                 // latest acceptable purchase date
  offers: OfferSpec[];           // confirmed by user, may be empty
  emiOptions: EmiSpec[];         // confirmed by user, may be empty
}
```

Plus the user's `FinancialState` (Step 2), held cards with catalogue terms (Step 1), quiz profile (income band, used only when budget is missing).

### 5.2 Offers: `applyOffer(offer, card, price)`

```ts
interface OfferSpec {
  type: 'instant_discount' | 'cashback' | 'no_cost_emi' | 'coupon';
  bank?: string; network?: string; cardNames?: string[];   // who qualifies
  percent?: number; flat?: number;
  minOrder?: number; maxDiscount?: number;
  emiOnly?: boolean;            // offer applies only on EMI
  rawText: string;
}
```

Returns `{ eligible, discount, reason }` for a card. Matching is conservative: an offer applies to a card only if bank (and network or card name, when stated) match the catalogue entry. Unknown → not eligible, reason "Couldn't confirm this card qualifies".

### 5.3 Rewards: `rewardFor(card, category, amount, { emi })`

From catalogue rates and remaining monthly cap (using this month's spend on that card from state when available). Many cards give no rewards on EMI-converted spend: add `cards.emi_rewards` (boolean, default false, verify per card) and respect it.

### 5.4 EMI: `emiTrueCost(emi, price)`

```ts
interface EmiSpec {
  tenureMonths: number;
  interestRatePa?: number;       // for regular EMI
  noCost?: boolean;              // interest offset by an upfront discount
  processingFee?: number;        // ₹
  bankName?: string;
}
```

- Regular EMI: reducing-balance interest over the tenure; GST 18% on interest and on processing fee.
- No-cost EMI: interest equals the discount given, so the net interest is ~0, but **GST on the interest and the processing fee (+ GST) are still paid**, and rewards may be lost (5.3).
- Output: `{ monthlyInstalment, totalInterest, gstOnInterest, processingFeeWithGst, rewardsLost, extraCostVsFullPayment }`, every line itemised for the breakdown.
- The cost of blocked limit is not charged as money but reported: the full price is blocked on the limit and released monthly; feed this to the utilisation step.

### 5.5 Timing: `floatDays(card, purchaseDate)` and `bestPurchaseDate(...)`

- A purchase on or before the statement date is billed on that statement; after it, on the next one. Interest-free days = that statement's due date − purchase date. Use `statement_day` and `due_day` from the card account, handling month lengths and the "31st" case.
- `bestPurchaseDate(card, from = now, to = needBy ?? now + 14 days)` returns the date in the window with the most interest-free days, plus the float on buying today.
- Only give timing advice if the purchase is a **credit card** purchase in full, the card has known statement and due days, and the difference vs today is at least 10 days. Otherwise say buying today is fine.

### 5.6 Credit health: `utilizationImpact(card, amount, state)`

- Balance basis: the manual override if newer than the statement, otherwise the last statement total, minus "marked paid".
- Returns utilisation before and after, plus `amountToReachUtilisation(30%)` before the next statement date.
- Thresholds (same config as Step 2): above 30% info, above 70% warn, above 90% or over limit block that card.

### 5.7 Options, affordability and verdict

`rankPaymentOptions(input, state, cards, now)` builds every option the user could take:

- each held card, paid in full, bought today
- each held card, paid in full, on its best date (if different and allowed)
- each confirmed EMI option on the cards it applies to
- UPI / debit (no rewards, no float) as the baseline

For each option compute: effective price after offers, rewards ₹, extra costs ₹ (EMI), net cost = effective price − rewards + extra costs, interest-free days, utilisation after, flags. Rank by net cost, then by fewer warnings, then by more interest-free days. Options blocked by utilisation > 90% are listed but not ranked first.

`affordability(input, state, profile)`:
- **Budget check:** price vs this month's left-to-spend (Step 2). If no budget, fall back to monthly income band midpoint × 0.3 as a rough discretionary limit and say so.
- **Due-date check:** for credit options, the money is needed by the due date; report "you'll need ₹X by 4 Feb".
- **Goal impact:** if any active goal's monthly need would no longer fit, report "this pushes your Goa goal back by about 2 months" (simple: price ÷ monthly saving rate).
- **Size label:** price as a share of monthly income band: small (< 10%), medium (10–40%), large (> 40%).

**Verdict rules (Locked, deterministic, in this order):**

| Verdict | When |
|---|---|
| `rethink_payment` | The user's chosen or default way to pay has extra cost ≥ ₹500 (e.g. an EMI with fees) and a cheaper option exists, **or** every card option pushes utilisation above 70% |
| `wait` | Price exceeds what's left this month by more than 25% **and** there is no need-by date within 14 days, **or** a goal would slip by more than 1 month |
| `go_with_timing` | Best option is a credit card in full and buying on its best date gains ≥ 10 extra interest-free days (within need-by) |
| `go` | Otherwise |

The verdict label shown to users: *Go ahead* · *Go ahead, on [date]* · *Better to wait* · *Pay a different way*. Never "Don't buy this".

Output:

```ts
interface PlanResult {
  verdict; headline;                         // template headline, Ember may rephrase
  recommended: OptionResult;                 // rank 1
  options: OptionResult[];
  affordability: { leftThisMonth, afterPurchase, neededByDate, neededAmount,
                   sizeLabel, goalImpacts: [...], basis: 'budget'|'income_estimate'|'none' };
  timing?: { bestDate, floatToday, floatBest, extraDays };
  credit?: { cardAccountId, before, after, payToStayUnder30 };
  emi?: EmiTrueCost;                         // for the best EMI option, if any
  missingData: string[];                     // e.g. 'no statements yet', 'no budget set'
  assumptions: string[];
}
```

---

## 6. Inputs on the phone

1. **Typed:** item name, price, optional merchant, optional need-by date, optional "Add an offer" (pick type, bank, % or ₹, cap, min order) and "Add an EMI option" (tenure, rate or no-cost, fee). Category inferred from item name (rules, then Gemini), editable.
2. **Screenshot:** `expo-image-picker` from Photos (works in Expo Go). Upload to `POST /api/plans/extract`; Gemini vision returns item, price, merchant, offers and EMI options into the same specs. The app shows them as editable fields to confirm. The image is processed in memory and not stored. Ask users to crop out personal details; the server also ignores anything that isn't product, price, offer or EMI text.
3. **Pasted link:** read merchant from the hostname and a rough item name from the URL slug (e.g. `/apple-iphone-15-black-128-gb/p/...`). Price must still be typed. No server fetch.
4. **Chat:** in the Ember tab, if the user asks about buying something, Ember calls `extractPlanFromMessage` (structured output), then shows an inline confirmation card in the chat ("iPhone 15, ₹59,900. Right?"), then runs the plan. If the price is missing, Ember asks for it.
5. **Clipboard nudge (nice to have):** when the planner opens and the clipboard holds a shop URL, offer "Use the link you copied?" (`expo-clipboard`, ask, never read silently).

Share-sheet entry from Amazon/Flipkart needs a native share extension and a dev build. Not in this step; log it as future work.

---

## 7. Ember for the planner

### 7.1 Tools (register with the Step 0 runner)

| Tool | Level | Purpose |
|---|---|---|
| `extractPlanFromMessage(text)` | 1 | Item, price, offers from a chat message (unconfirmed) |
| `planPurchase(planInput)` | 1 | Runs the engine, returns `PlanResult` |
| `getPlan(planId)` / `listPlans()` | 1 | History |
| `whatIfPlan({ planId, changes })` | 1 | E.g. different card, date, EMI tenure, price |
| `getFinancialState()`, `bestCardFor()`, `utilizationImpact()`, `emiTrueCost()` | 1 | From Step 2 / shared |
| `setPlanReminder({ planId, date })` | 2 | Triggered by the user's button, not chosen by the model |
| `proposeGoal({ name, target, date })` | 3 | From Step 2; the UI shows Confirm |

### 7.2 Run and narration

`POST /api/plans/run` runs `runEmber({ task: 'plan', maxPermission: 1 })`. The model sequences tools; the engine still produces the full result even if the model skips a tool (call `planPurchase` server-side first, then let the model explain, so the result never depends on the model's choices).

Narration steps (shown live, from tool events): "Checked your budget for November" → "Compared your 2 cards with the bank offer" → "Looked at your statement dates" → "Checked your credit limit" → "Worked out the real cost of the no-cost EMI" → "Writing your answer". Skip steps that don't apply.

### 7.3 Explanation rules

- 2–4 sentences. Lead with the verdict and the one action.
- Only numbers present in `PlanResult`; validate and fall back to a template if any number isn't found.
- Mention the single most important trade-off.
- Say what was missing ("I don't have your statement dates yet, so I can't time this").
- No judgement of the item, no urgency, no investment or loan advice.

Example: *"Go ahead, but on the 16th. Your HDFC statement closes on the 15th, so buying a day later gives you 49 interest-free days instead of 19. Use HDFC Millennia: the ₹1,500 bank offer plus 5% back makes it ₹2,240 cheaper than paying by UPI. Your limit use goes to 58%, so pay ₹10,000 early if you can."*

---

## 8. Plan actions and follow-up

- **Remind me on [best date]:** sets `remind_at`, status `reminder_set`. Server-side: the nudge engine (Step 2) gains rule `plan_buy_window` (priority 80) that fires on `remind_at` at 09:00 IST, recomputes the plan with fresh state, and words the nudge from the new result. If the recomputed verdict changed (e.g. utilisation rose), the nudge says so. In Expo Go, also schedule a local notification as the fallback, as in Step 2.
- **Start a savings goal** (shown when verdict is `wait`): Ember proposes name, target = price, date from the user's saving pace; user confirms.
- **Save plan** / **I bought it** / **Not buying**: status updates. Bought plans move to history.
- **Ask Ember:** opens chat thread `plan:<id>` with chips: "What if I use the EMI?", "What if I wait a month?", "Use my other card".
- **Automatic purchase match:** when a new statement is confirmed (Step 2), look for a debit within ±5% of a planned price, within 30 days of `created_at`, at a matching merchant or category. If found, create an in-app nudge "Looks like you bought the iPhone on 16 Nov. Mark this plan as done?" (not pushed; does not count against the daily cap). On yes, link `matched_transaction_id` and record in the activity log whether the recommended card and date were used (feeds the "Ember saved you ₹X" line).
- Plans not acted on expire 30 days after `need_by_date` or 45 days after creation.

---

## 9. API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/plans/extract` | Screenshot or message → unconfirmed PlanInput |
| POST | `/api/plans/run` | Confirmed PlanInput → PlanResult + explanation (SSE or polling for narration, same as earlier steps) |
| POST | `/api/plans/:id/what-if` | Changes → new PlanResult (not saved unless confirmed) |
| GET | `/api/plans` / `GET /api/plans/:id` | History / detail |
| PATCH | `/api/plans/:id` | Status, remind_at, need_by |
| DELETE | `/api/plans/:id` | Delete |

All routes use `getAuthedUser(req)` and zod schemas from `packages/shared`. Rate limit `/extract` and `/run` (e.g. 20 per user per day) to protect the Gemini quota.

---

## 10. Mobile screens

Same design tokens: dark navy default, chartreuse for Ember accents only, Indian number formatting, every ₹ figure tappable to its source.

1. **Home:** a primary "Should I buy this?" button under the Ember noticed card, and a "Your plans" row when plans exist.
2. **Plan input:** item, price (large numeric field), optional merchant and need-by date, "Add screenshot", "Paste link", collapsible "Offers and EMI" section. Continue button disabled until item and price are set.
3. **Confirm extracted details:** shown after a screenshot or chat extraction, with every field editable and a note "Check these before Ember plans".
4. **Ember is planning:** narration steps, chartreuse checkmarks.
5. **Result:**
   - Verdict chip and Ember's 2–4 sentence answer.
   - **Recommended:** card (or UPI), date, net cost, saving vs UPI.
   - Sections, each expandable: *Budget* (left this month → after, money needed by due date, goal impact), *Best way to pay* (ranked options table), *Timing* (a small 3-week calendar strip highlighting today, statement date and best day, with interest-free days), *Credit limit* (before/after bars, "pay ₹X early"), *EMI vs pay in full* (itemised: interest, GST, processing fee, rewards lost).
   - "What Ember couldn't check" list when `missingData` isn't empty, with a link to fix it (upload statement, set budget, add cards).
   - Actions: Remind me on [date] / Start a savings goal / Save / Ask Ember.
6. **Plan detail and history:** list in Profile → "Your plans", with status, and the matched transaction for bought plans.
7. **Chat:** inline confirmation card and result summary card inside the Ember thread, tapping through to the full result screen.

---

## 11. Tests, evals and demo

**Unit tests (finance-engine):**
- `floatDays` across month ends, February, statement day 31, due date in next month.
- `bestPurchaseDate` within and outside the need-by window; no timing advice under 10 days gain.
- `emiTrueCost`: regular EMI, no-cost EMI with fee (cost > 0), no-cost EMI with no fee (only GST on interest), rewards lost.
- `applyOffer`: min order, cap, card mismatch, EMI-only offers.
- `rankPaymentOptions`: a case where the **cheapest sticker price is not the best option** (Locked acceptance test), a case where UPI wins because both cards are near their limits, ties.
- Every verdict rule, including order of precedence.
- Missing data: no statements, no cards, no budget.

**API tests:** run → save → what-if → remind → statement match round trip with the mocked parser from Step 2.

**Evals (`ember.eval.ts`, 10 new fixtures):** explanation numbers all present in PlanResult; verdict in the text matches the engine; no item judgement and no urgency words; chat extraction asks for a missing price instead of guessing; screenshot extraction on 5 sample product screenshots (synthetic, in `fixtures/plans/`) gets price right in all 5.

**Demo (extend the Step 2 demo loader):** three ready plans on the demo user, each opening a different verdict:
1. ₹59,900 phone with a ₹1,500 HDFC offer → *Go ahead, on the 16th* (extra 30 interest-free days).
2. ₹24,999 laptop on "no-cost EMI" with ₹199 fee → *Pay a different way* (true cost shown).
3. ₹38,000 trip package with the food budget nearly used and a Goa goal → *Better to wait* + goal proposal.
With time travel, the demo also shows the `plan_buy_window` nudge firing on the 16th.

---

## 12. Acceptance criteria

- [ ] A plan can start from Home, from chat, and from a screenshot, and always passes through confirmation.
- [ ] The engine returns options, affordability, timing, credit and EMI sections, all from finance-engine with tests.
- [ ] The cheapest-sticker-price-isn't-best test passes.
- [ ] Verdict follows the Section 5.7 rules exactly; Ember's text matches it.
- [ ] Explanation contains only numbers from the result; template fallback works with Gemini off.
- [ ] Missing data is named, never silently skipped.
- [ ] Remind me creates a server nudge on the date (and a local notification fallback in Expo Go); the nudge recomputes with fresh data.
- [ ] Wait verdict can create a savings goal through Ember's proposal and the user's confirmation.
- [ ] A later statement with a matching transaction prompts "mark as bought".
- [ ] `rankPaymentOptions` and `emiTrueCost` are exported from finance-engine with types in `packages/shared`, ready for the extension endpoint.
- [ ] No shop page is fetched by the server; screenshots aren't stored.
- [ ] The three demo plans and the reminder nudge work on an iPhone in Expo Go.
- [ ] All tests and evals pass; `docs/RUNNING.md`, `docs/EVALS.md` and `docs/DECISIONS.md` updated.

---

## 13. Order of work and checkpoints

Commit after each:

1. Re-read earlier handoffs, AUDIT and DECISIONS; note anything changed → append to `docs/AUDIT.md`
2. Schema: `purchase_plans`, `cards.emi_rewards` (+ verify on the 40 catalogue cards, default false)
3. Types in `packages/shared` (PlanInput, OfferSpec, EmiSpec, OptionResult, PlanResult)
4. Engine: `floatDays`, `bestPurchaseDate`, `applyOffer`, `rewardFor`, `emiTrueCost` + tests
5. Engine: `utilizationImpact` reuse, `affordability`, `rankPaymentOptions`, verdict rules + tests (including the cheapest-isn't-best case)
6. `/api/plans/run` with Ember tools, narration and explanation validation → **checkpoint: typed plan works end to end on the iPhone**
7. `/api/plans/extract` (screenshot + chat), link parsing, confirmation screens
8. Result screen sections, calendar strip, what-if
9. Actions: remind (nudge rule + local fallback), goal proposal, save/bought/dropped, plan history
10. Chat integration: intent, inline confirmation and result cards, plan threads
11. Statement purchase matching
12. Evals, demo plans, time travel → **checkpoint: full demo on iPhone**
13. Docs and full acceptance pass → **done**

If something blocks you, choose the simplest option that keeps the acceptance criteria true, record it in `docs/DECISIONS.md`, and continue. Ask the founder only for what you can't decide yourself (keys, deployment access, real screenshots to test with).
