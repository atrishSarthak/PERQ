# PERQ: Build Handoff, Step 2 (Money Manager)

*For a Claude Code session working in the PERQ monorepo after Step 0 and Step 1 are complete. Read this whole file before writing code. The Step 0/1 handoff (`docs/PERQ_Handoff_Step0_Step1.md`), `docs/AUDIT.md` and `docs/DECISIONS.md` still apply. Where this file and existing code disagree on a small detail, keep the code and note it in DECISIONS.md. Where they disagree on something marked **Locked**, follow this file.*

Last updated: 2026-11-01

---

## 1. What "done" looks like

At the end of this handoff, on an iPhone through Expo Go:

1. The user uploads a credit card statement PDF from Files, enters its password, and watches Ember read it step by step.
2. Ember checks that the numbers add up, categorises every transaction, links the statement to the right card, and shows a summary to confirm.
3. The **Home** tab becomes a money manager: money left in this month's budget, an "Ember noticed" card, upcoming dues, spending by category.
4. A daily job and every new statement run a **nudge engine** that finds what matters (bill due soon, high utilisation, fees charged, fee-waiver pace, a better card for a past spend, points value) and sends at most **two nudges a day**.
5. Tapping a nudge opens a chat with Ember that already knows the numbers behind it.
6. Each card has a detail screen: statement summary, utilisation, points and their ₹ value, fee-waiver progress, transactions, and "best card in hindsight".
7. Budgets and savings goals can be set, and Ember tracks them.
8. Real spending from statements can replace the quiz estimates in the Card Recommender, with one tap.
9. A demo account with three months of statements across two cards shows all of this in under a minute, for presentations.
10. The user can see what Ember did this week, see why each nudge appeared, and delete any statement or all their data.

---

## 2. Ground rules (Locked)

All Step 0/1 rules still apply: code computes and the LLM reasons, secrets stay server-side, shared logic in `packages/*`, no dark patterns, everything runs in Expo Go. Added for this step:

- **No Account Aggregator, no bank login, no SMS, no email reading.** The only data source is a statement PDF the user picks, plus what they type.
- **The PDF and its password never touch disk or storage.** Decrypt and parse in memory inside the request, then drop both. Store only the extracted structured data.
- **The password never reaches the database or logs.** If the user chooses "remember on this phone", it is stored in `expo-secure-store` on the device only.
- **A statement is accepted only if it reconciles** (Section 5.4). A wrong number on a money app is worse than no number.
- **Nudge rules are deterministic code.** Gemini only writes the sentence, with a template fallback. Rules decide *whether* and *what*; the LLM decides only *wording*.
- **Two nudges a day maximum per user**, enforced in code.
- **Ember's permission levels hold.** Nudges are level 2. Setting a budget or goal is level 3 (Ember proposes, the user confirms). Nothing in this step is level 4. Level 5 actions (paying bills, moving money) do not exist.
- **The clock is injectable.** Every rule and the financial state take `now` as a parameter so tests and the demo can move time.

---

## 3. Scope

**In scope:** statement upload and parsing, card accounts, transactions and categories, financial state, nudge engine, push and in-app notifications, nudge-to-chat, card detail, budgets and goals, activity log, "why am I seeing this?", recommender sync with real spend, data controls and consent, demo data, tests and evals.

**Out of scope (do not start):** SMS reading, email forwarding, Swiggy, Chrome extension, "Should I buy this?" planner, bill payment, reward redemption flows, Account Aggregator, Google sign-in, store builds.

---

## 4. Data model

New tables (Drizzle, in `packages/db`). Adapt names to existing conventions.

```
card_accounts
  id, user_id, card_id (fk cards, nullable if unmatched), issuer, card_label,
  last4, statement_day (1–31), due_day (1–31), credit_limit,
  fee_anniversary_month (1–12, nullable), current_balance_override (nullable int),
  current_balance_updated_at, is_active, created_at
  -- also set user_card_arsenal status = 'held' when linked to a catalogue card

statements
  id, user_id, card_account_id, statement_date, period_start, period_end,
  due_date, total_due, minimum_due, previous_balance, payments_credits,
  purchases_debits, fees_charges, finance_charges, credit_limit, available_limit,
  points_opening, points_earned, points_redeemed, points_closing,
  points_expiring, points_expiry_date,          -- all nullable when not printed
  reconciled boolean, reconcile_diff int,
  parser_version, model, created_at
  unique (card_account_id, statement_date)       -- re-upload replaces

transactions
  id, user_id, statement_id, card_account_id, txn_date, description_raw,
  merchant_normalized, amount (int ₹, positive), direction ('debit'|'credit'),
  kind ('purchase'|'payment'|'refund'|'fee'|'interest'|'emi'|'cashback'|'other'),
  category (see 5.5), category_source ('rule'|'cache'|'ai'|'user'),
  is_international boolean, created_at

merchant_categories            -- shared across users, no personal data
  merchant_normalized (pk), category, source, updated_at

budgets
  id, user_id, month (YYYY-MM, null = recurring default), total_limit,
  category_limits jsonb, created_at, updated_at

goals
  id, user_id, name, target_amount, target_date, saved_amount,
  status ('active'|'done'|'archived'), created_at

nudges
  id, user_id, rule_id, dedupe_key, card_account_id (nullable), priority,
  payload jsonb,                -- exact numbers the rule computed
  title, body, body_source ('ai'|'template'),
  status ('queued'|'sent'|'opened'|'acted'|'dismissed'|'expired'|'suppressed'),
  scheduled_for, sent_at, opened_at, acted_at, dismissed_at, expires_at, created_at
  unique (user_id, dedupe_key)

push_tokens
  id, user_id, expo_token, platform, created_at, last_seen_at

consents
  id, user_id, source ('statements'|'notifications'), granted boolean,
  notice_version, created_at

activity_events
  id, user_id, type, summary, ref_table, ref_id, created_at
  -- e.g. 'statement_parsed', 'nudge_sent', 'budget_set', 'goal_created'
```

Existing tables reused: `agent_runs`, `chat_messages` (add `thread_ref` such as `nudge:<id>` or `card:<id>`), `user_card_arsenal`, `cards`.

`financial_state` is **computed, not stored as truth**: a pure function builds it on demand. Cache the result per user in a `financial_state_cache (user_id pk, version, computed_at, state jsonb)` row, invalidated on any write to the user's statements, transactions, budgets, goals or card accounts.

---

## 5. Statement ingestion

### 5.1 Flow

```
Mobile: pick PDF (expo-document-picker) → enter password (or use remembered one)
  → POST /api/statements/parse (multipart: file, password)
Server, all in memory:
  1. Validate: PDF, ≤ 4 MB (Vercel body limit), user has 'statements' consent
  2. Decrypt + extract text (5.2)          → narration "Unlocked your statement"
  3. Structured extraction (5.3)          → "Read 42 transactions"
  4. Reconcile (5.4)                      → "Checked that the totals add up"
  5. Categorise (5.5)                     → "Sorted spends into categories"
  6. Match to a card account (5.6)        → "Matched to your HDFC Millennia"
  7. Return a draft (not saved yet) with a parse_token (signed, 15-min expiry,
     holds the extracted JSON server-side in a short-lived cache, no PDF, no password)
Mobile: review screen → user confirms or edits card / dates / totals
  → POST /api/statements/confirm { parse_token, edits }
Server: save statement + transactions, upsert card account, invalidate state,
  run nudge engine for this user, write activity event
```

Narration streams the same way as Step 1 (SSE or polling, whichever Step 1 settled on).

### 5.2 Decrypt and extract

- Use `pdfjs-dist` (legacy Node build) with the `password` option, or `unpdf` if Step 1 already uses it. Must run on Vercel serverless.
- Wrong password → return `{ error: 'bad_password' }` so the app can ask again. After 5 wrong attempts in 10 minutes, rate-limit.
- Extract text page by page, keeping line order. Preserve table rows as lines.
- If extracted text is empty or nearly empty (scanned image statement), return `{ error: 'image_only' }` with a friendly message. OCR is out of scope.
- Common password hints to show in the app (do not store): many banks use the first 4 letters of the name plus DDMM of birth; some use the card's last digits. Show "Check your statement email for the password format".

### 5.3 Structured extraction

- Gemini with a **strict JSON schema** (zod → JSON schema, structured output mode). One schema, all banks.
- Fields: issuer, card name as printed, last4, statement date, period, due date, total due, minimum due, previous balance, payments/credits, purchases/debits, fees and charges, finance charges, credit limit, available limit, points block (opening, earned, redeemed, closing, expiring, expiry date), and transactions `[date, description, amount, debit|credit]`.
- Prompt rules: copy numbers exactly as printed; dates as ISO; amounts as positive numbers with direction separate; return null rather than guessing; include every transaction line, including fees, GST, interest and EMI lines.
- Long statements: split transaction pages into chunks, extract header fields once, merge transactions, de-duplicate identical lines that appear on page breaks only when date, description and amount all match **and** the line appears in two adjacent chunks.
- Set `parser_version` so statements can be re-parsed later if the parser improves.

### 5.4 Reconciliation (Locked)

A deterministic function in `packages/finance-engine`:

```
expected_total = previous_balance − payments_credits + purchases_debits
                 + fees_charges + finance_charges
reconciled if |expected_total − total_due| ≤ max(₹5, 0.1% of total_due)
```

Also check that transaction lines sum to the summary block (debits ≈ purchases + fees + finance charges, credits ≈ payments + refunds), within the same tolerance.

If either check fails:
1. Retry extraction once with the failing figures named in the prompt ("the transactions sum to X but the summary says Y; re-read").
2. If it still fails, show the review screen with the mismatch highlighted. The user can correct the summary numbers. Save with `reconciled = false` and **exclude unreconciled statements from rupee-based nudges** (dues and points still allowed, since those are printed values).

### 5.5 Categories

Use the same categories as the Step 1 quiz so real spend maps onto the recommender:

`food_delivery, online_shopping, groceries, dining, fuel, bills, travel, upi, entertainment, health, education, rent, emi, fees_interest, cash, transfers, other`

Order of resolution:
1. **Kind first:** payments, refunds, cashback, interest, GST and fee lines get a `kind` and are not spending.
2. **Rules:** keyword map in `packages/finance-engine/categories.ts` (SWIGGY, ZOMATO → food_delivery; AMAZON, FLIPKART, MYNTRA → online_shopping; BLINKIT, ZEPTO, BIGBASKET, INSTAMART → groceries; HPCL, BPCL, IOCL, SHELL → fuel; AIRTEL, JIO, BESCOM, electricity, broadband → bills; MAKEMYTRIP, IRCTC, INDIGO, AIR INDIA, hotels → travel; UPI-tagged lines → upi unless a merchant rule matches; etc.). Normalise merchant names first (strip city, reference numbers, "PVT LTD", payment-gateway prefixes like "PAYU*", "RAZ*").
3. **Shared cache:** `merchant_categories`.
4. **Gemini batch** for unknown merchants only (merchant name in, category out, no amounts or user data). Write results to the cache.
5. **User override** wins and is remembered for that user's future statements. Do not write user overrides to the shared cache.

### 5.6 Card matching

- Match issuer + printed card name against the catalogue (fuzzy match, threshold, then ask). Match last4 against existing card accounts.
- New card: create a `card_account`, infer `statement_day` from statement date and `due_day` from due date, set credit limit, mark the catalogue card as held.
- The review screen always shows the match and lets the user change it, including "My card isn't listed" (keeps `card_id` null; rupee rules that need card terms are skipped for it).
- If the statement has an annual fee line, set `fee_anniversary_month` from it.

---

## 6. Financial state

`buildFinancialState(data, now)` in `packages/finance-engine`, pure and tested. Output:

```
{
  asOf, dataThrough,                         // latest statement date across cards
  cards: [{
    cardAccountId, label, last4, issuer,
    latestStatement: { date, dueDate, totalDue, minimumDue, reconciled },
    daysToDue, isPaidMarked,
    creditLimit, balanceForUtilisation,       // override if newer than statement, else total_due
    utilisationPct, nextStatementDate, daysToStatement,
    points: { closing, valueRupees, expiring, expiryDate } | null,
    feeWaiver: { threshold, spentThisCardYear, remaining, monthsLeft, onPace } | null,
    feesLastCycle: { total, lines[] },
  }],
  totals: { totalDueAll, utilisationOverallPct },
  month: { key: 'YYYY-MM', spendByCategory, totalSpend, budget, leftToSpend,
           daysLeft, coverage: 'complete' | 'partial' },
  missedRewardsLastCycle: { total, items: [{ txnId, usedCard, betterCard, extra }] },
  goals: [{ id, name, target, saved, pctDone, monthlyNeeded }],
}
```

Notes:
- **Month spend is honest about coverage.** Statements arrive after the month ends, so the current month is usually partial. `coverage` and `dataThrough` drive the UI copy: "Based on statements up to 15 Oct".
- **Manual balance update:** on a card's screen the user can type "current outstanding" (one number). It updates `current_balance_override` and drives utilisation until the next statement. This is how pre-statement utilisation warnings work without SMS.
- **Mark as paid:** a button on each due. It only sets a flag (no money moves). It silences due nudges for that statement.
- **Best card in hindsight:** for each purchase in the last cycle, compare the reward actually earned (card used, from catalogue rates) with the best card the user holds. Uses `bestCardFor(category, amount, heldCards)` from finance-engine. Skip cards with no catalogue match.
- **Points value:** `points_closing × cards.redemption_value`. Show as "about ₹X".
- **Fee waiver pace:** sum of purchase spend since the last anniversary month, compared with `fee_waiver_spend`, and projected at the current monthly pace.

---

## 7. Nudge engine

### 7.1 Structure

`packages/finance-engine/nudges/` holds one file per rule. Each rule:

```ts
interface NudgeRule {
  id: string;
  evaluate(state: FinancialState, ctx: { now: Date; history: NudgeHistory }): NudgeCandidate[];
}
interface NudgeCandidate {
  ruleId; dedupeKey;            // e.g. `due_soon:${cardId}:${statementDate}`
  priority: number;             // 0–100
  cardAccountId?; payload;      // all numbers the copy may use
  expiresAt;
  templateTitle; templateBody;  // fallback copy, filled from payload
}
```

`runNudgeEngine(userId, now)` in `apps/web` (server):
1. Build state.
2. Evaluate all rules → candidates.
3. Drop candidates whose `dedupeKey` already exists (any status), whose rule is suppressed for the user, or that are expired.
4. Apply learned suppression: a rule dismissed 3 times in 30 days without being acted on gets priority −30 for that user for 30 days.
5. Sort by priority. Respect the daily cap (2, counted on `sent_at` in IST). Extra candidates stay `queued` and can be sent on later days if still valid.
6. For each to send: ask Gemini for title + body using **only payload fields** (max 90 characters title, 160 body, Ember's voice, no urgency words); validate every number in the text exists in the payload, otherwise use the template.
7. Save, push (7.3), write an activity event.

### 7.2 Rules (Locked list for this step)

| Rule id | Fires when | Priority | Example copy |
|---|---|---|---|
| `due_soon` | Due in 1–3 days, not marked paid | 90 | "HDFC bill of ₹18,240 is due on Thursday." |
| `due_today` | Due today, not marked paid | 95 | "Your Axis bill (₹6,120) is due today." |
| `min_due_trap` | Last statement shows previous balance carried with finance charges > 0 | 85 | "You paid ₹1,410 in interest last cycle. Paying the full ₹12,300 avoids it." |
| `fees_charged` | Fees/charges/late fee/forex markup lines in last statement ≥ ₹1 | 70 | "₹590 in fees on your SBI statement, including a ₹500 late fee." |
| `high_utilisation` | Utilisation ≥ 70% and statement closes within 5 days (warn), or ≥ 30% (info, priority 40) | 75 / 40 | "You're at 74% of your limit and the statement closes in 2 days. Paying ₹8,000 brings it under 30%." |
| `statement_upload` | Today is 2+ days after expected statement date and no new statement | 60 | "Your HDFC statement should be out. Upload it to keep your numbers current." |
| `fee_waiver_pace` | Fee-waiver threshold known and behind pace with ≤ 4 months left, or within 15% of threshold | 55 | "₹22,000 more spend by March waives the ₹1,000 fee." |
| `missed_rewards` | Best-card-in-hindsight extra ≥ ₹100 last cycle | 50 | "Using your Axis Ace for food orders would have earned ₹340 more last month." |
| `points_value` | Points closing ≥ value of ₹500, or points expiring printed | 45 (65 if expiring within 60 days) | "4,200 points on your card, worth about ₹1,050." |
| `budget_pace` | Category or total spend > 80% of budget with > 7 days left (only when coverage allows) | 50 | "Food delivery is at ₹4,100 of your ₹5,000 budget." |
| `goal_progress` | Goal behind schedule by > 15% | 35 | "Goa trip fund is ₹3,000 behind plan. ₹2,500 a month gets you there." |

All thresholds live in one config file. Computed amounts such as "paying ₹8,000 brings it under 30%" come from finance-engine (`amountToReachUtilisation`), not the LLM.

### 7.3 Delivery

- **In-app inbox always works.** A bell on Home shows nudges; the "Ember noticed" card shows the top unread one.
- **Push:** `expo-notifications` + Expo push service. On first launch after sign-in, ask for notification permission on a screen explaining what Ember sends and the 2-a-day limit. Store the Expo push token. Server sends with Expo's push API (`expo-server-sdk`).
- **Expo Go caveat:** confirm whether the current Expo Go build supports remote push on iOS for this SDK. If it does not, keep the server code, and in Expo Go fall back to **local notifications** scheduled by the app when it syncs (due-date reminders scheduled on device), plus the in-app inbox. Record the outcome in DECISIONS.md. Do not switch to a dev build in this step.
- Notification tap → deep link `perq://nudge/<id>` → opens the nudge chat (7.4). Mark `opened`.
- Quiet hours: no push between 22:00 and 08:00 IST; queue until 09:00.

### 7.4 Nudge → chat

- Opening a nudge creates or reuses a chat thread `thread_ref = nudge:<id>`.
- The first Ember message restates the nudge and offers 2–3 chips specific to the rule, e.g. `due_soon`: "Mark as paid", "Remind me tomorrow", "Why does paying in full matter?"; `missed_rewards`: "Show the transactions", "Which card for food from now on?".
- Ember's context for the thread: the nudge payload plus tools. "Mark as paid" and "Remind me tomorrow" are UI actions (buttons), not LLM decisions.
- Footer on each nudge and its chat: **"Why am I seeing this?"** shows the rule's plain-English description, the numbers from the payload, and the data date ("From your HDFC statement dated 15 Oct").
- Mark `acted` when the user taps a primary action or changes something in response; `dismissed` on swipe.

### 7.5 Scheduling

- Vercel Cron, once a day at 03:30 UTC (09:00 IST): `GET /api/cron/nudges`, protected by `CRON_SECRET`. Iterates active users in batches.
- Also run for a single user after a statement is confirmed, after a balance update and after a budget change.
- Local dev: `pnpm nudges:run --user <id> --now 2026-11-14` to run with a fake date.

---

## 8. Ember for the Money Manager

New tools in `packages/ai` (register with the Step 0 runner):

| Tool | Level | Purpose |
|---|---|---|
| `getFinancialState()` | 1 | The state object |
| `getTransactions({ cardAccountId?, category?, from?, to?, minAmount?, limit })` | 1 | Filtered list, max 100 rows |
| `getStatement(statementId)` | 1 | Summary block |
| `getCardRules(cardId)` | 1 | From catalogue |
| `bestCardFor({ category, amount })` | 1 | Uses held cards |
| `utilizationImpact({ cardAccountId, amount })` | 1 | New utilisation % |
| `amountToReachUtilisation({ cardAccountId, targetPct })` | 1 | ₹ to pay |
| `feeWaiverStatus(cardAccountId)` | 1 | Pace and remaining |
| `explainNudge(nudgeId)` | 1 | Rule description + payload |
| `proposeBudget({ total, categories })` | 3 | Returns a proposal the UI shows with Confirm |
| `proposeGoal({ name, target, date })` | 3 | Same |

Chat rules: every ₹ figure must come from a tool result in this conversation; if data is missing say so and suggest uploading a statement; never advise on investments, loans or insurance products; never say a bill has been paid.

Update the Step 1 recommender tools so `getUserProfile` returns real spend when the user has synced it (Section 9).

---

## 9. Recommender sync with real spend

- After at least one reconciled statement, compute average monthly spend per category over available statements (up to 3).
- Home and the Cards tab show: "Your recommendations use quiz estimates. Use your real spending?" → one tap.
- On confirm, store `profile.spendSource = 'statements'` with the computed numbers. Re-score. The results header says "Based on your last N statements".
- Leakage now uses real spend. If the Top Pick changes, regenerate the explanation (existing guardrail).
- The user can switch back to quiz answers in Profile.

---

## 10. Mobile screens

Follow the Step 0 tokens: dark navy default, chartreuse for Ember accents only, Indian number formatting, every ₹ figure tappable to its source.

1. **Home (rebuilt, Kept-style):**
   - Header: "Left to spend in November" with ₹ and days left, or "Set a monthly budget" if none. Small "Based on statements up to …" line.
   - **Ember noticed** card: top unread nudge, chartreuse accent, tap to chat.
   - **Upcoming dues:** each card's due amount, date, days left, "Mark as paid".
   - **Spending this month** by category (horizontal bars, budget lines if set).
   - Recommender sync prompt (Section 9) when relevant.
   - Empty state for no statements: one clear "Upload your first statement" button and a line on privacy ("We read it once and delete the file").
   - Bell icon → nudge inbox.
2. **Upload flow:** consent screen (first time only) → pick PDF → password field with show/hide, "Remember on this phone" toggle, password-format hint → Ember narration → review screen (card match, statement date, due date, total due, minimum due, transaction count, reconcile status, edit fields) → Confirm → back to Home with the update.
3. **Cards tab:** segmented control **My cards | Explore**. *Explore* is the Step 1 recommender. *My cards* lists card accounts with due, utilisation bar and points.
4. **Card detail:** statement summary; utilisation with "Update current balance"; points and ₹ value; fee-waiver progress; fees last cycle; best card in hindsight; transactions (search, filter by category, tap to recategorise); statement history with delete; "Upload new statement".
5. **Nudge inbox:** list grouped Today / Earlier, status, swipe to dismiss.
6. **Nudge chat:** Ember thread with chips and action buttons, "Why am I seeing this?".
7. **Budgets & goals** (from Home or Profile): monthly total, category limits (prefilled from quiz/real spend), goals list with progress. Ember can propose; the user confirms.
8. **Activity** (Profile → "What Ember did"): this week's events, e.g. "Read your HDFC statement (42 transactions)", "Sent 3 nudges, you acted on 2", "Found ₹340 in missed rewards".
9. **Privacy & data** (Profile): consents with dates, notification toggle, delete a statement, delete all financial data, delete account. Deletion is immediate and cascades.

---

## 11. API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/statements/parse` | Multipart upload → draft + narration (5.1) |
| POST | `/api/statements/confirm` | Save draft with edits |
| GET | `/api/statements?cardAccountId=` | History |
| DELETE | `/api/statements/:id` | Delete statement + its transactions |
| GET | `/api/state` | Financial state (cached) |
| GET | `/api/card-accounts` / `GET /:id` | List / detail |
| PATCH | `/api/card-accounts/:id` | Label, link to catalogue card, balance override, mark paid, days |
| GET | `/api/transactions` | Filters as in `getTransactions` |
| PATCH | `/api/transactions/:id` | Recategorise |
| GET/PUT | `/api/budgets` | Current budget |
| GET/POST/PATCH | `/api/goals` | Goals |
| GET | `/api/nudges` | Inbox |
| PATCH | `/api/nudges/:id` | opened / acted / dismissed |
| GET | `/api/nudges/:id/why` | Explanation |
| POST | `/api/push/register` | Save Expo push token |
| GET | `/api/activity` | Activity events |
| POST | `/api/recommender/sync-spend` | Section 9 |
| POST | `/api/consents` | Record consent |
| DELETE | `/api/me/financial-data` | Delete all statements, transactions, state, nudges |
| GET | `/api/cron/nudges` | Daily job (CRON_SECRET) |
| POST | `/api/demo/load` | Demo data (Section 13), only when `DEMO_ENABLED=true` |

All user routes use `getAuthedUser(req)` from Step 0 and validate with zod schemas from `packages/shared`.

---

## 12. Privacy and compliance (Locked)

- Consent screen before the first upload: what is read, what is stored (structured figures and transaction lines), what is not stored (PDF, password), how to delete. Store a `consents` row with `notice_version`.
- Separate consent for notifications.
- No transaction text, amounts or passwords in server logs or `agent_runs` (store tool names, durations and counts only). Add a log redaction helper and a test for it.
- Gemini receives statement text only for extraction and merchant names only for categorisation. Note in DECISIONS.md which Gemini terms apply (paid vs free tier data use) and recommend the paid tier before real users.
- Deletion cascades and also clears `financial_state_cache`, chat threads linked to nudges, and nudges.
- No card numbers beyond last 4 are stored. Strip full card numbers from `description_raw` if they appear.

---

## 13. Test data and demo mode

**Never commit real statements.** Real ones the team uses for testing go in `fixtures/private/` (gitignored).

1. **Synthetic statement generator** `pnpm statements:fake`: produces password-protected PDFs (e.g. `pdfkit` with `userPassword`) in 3 layouts that imitate common Indian bank formats (summary box + transaction table; two-column; multi-page with points block). Include fees, interest, GST, a refund, a payment, UPI lines and international spend. Each file comes with its expected JSON.
2. **Parser tests** run the generator output through decrypt → extract → reconcile and compare with the expected JSON. Gemini calls in unit tests are mocked; a separate `pnpm eval:statements` runs real Gemini on the fixtures and reports field accuracy.
3. **Demo user** `POST /api/demo/load` (and a "Load demo data" button in Diagnostics): creates two card accounts (one catalogue cashback card, one rewards card), three months of statements and ~120 transactions, a budget, a goal, and sets things up so that, with `now` = a chosen demo date, the engine produces: a bill due in 2 days, 74% utilisation before statement close, ₹340 of missed rewards, a ₹590 fee, points worth about ₹1,050, and food delivery near budget. A "Reset demo" button clears it.
4. A dev-only **time travel** control in Diagnostics sets a `now` override for the demo user so the presenter can show nudges firing.

---

## 14. Tests and evals

- finance-engine: reconciliation (pass, fail, tolerance edges), state builder (partial coverage, override newer/older than statement, marked paid), every nudge rule with fixed `now` (fires, doesn't fire, dedupe key stable), daily cap and quiet hours, learned suppression, best card in hindsight, fee-waiver pace, points value, amountToReachUtilisation.
- Categorisation: merchant normalisation table tests (at least 40 real-looking descriptors), rule precedence, user override not leaking to shared cache.
- API: parse → confirm → state → nudges round trip with the mocked parser; deletion cascade; consent required.
- Redaction: logs and `agent_runs` contain no amounts or descriptions.
- `ember.eval.ts` additions (10 fixtures): nudge copy contains only payload numbers and no banned words; chat answers "why is my utilisation high?" and "where did my money go last month?" with tool-sourced numbers; Ember refuses investment advice politely.
- `pnpm eval:statements`: field-level accuracy on synthetic fixtures ≥ 98% on summary fields, ≥ 95% on transactions; report included in `docs/EVALS.md`.

---

## 15. Environment variables (additions)

`apps/web/.env.local`
```
CRON_SECRET=
EXPO_ACCESS_TOKEN=          # optional, for Expo push security
DEMO_ENABLED=true           # false in any real deployment
PARSE_TOKEN_SECRET=
```
`vercel.json`: cron for `/api/cron/nudges` at `30 3 * * *`.

---

## 16. Acceptance criteria

- [ ] A synthetic HDFC-style password-protected statement uploads from the iPhone, reconciles, shows the review screen and saves.
- [ ] Wrong password gives a clear retry; image-only PDFs are rejected politely.
- [ ] A statement that doesn't reconcile is never shown as reconciled and does not drive rupee nudges.
- [ ] The PDF and password are never written to disk, database or logs (verified by test and code review notes in DECISIONS.md).
- [ ] Home shows left to spend, Ember noticed, upcoming dues and category spend, with honest "based on statements up to" copy.
- [ ] Card detail shows utilisation, points value, fee-waiver pace, fees, transactions and best card in hindsight.
- [ ] Every rule in 7.2 has tests; the engine never sends more than 2 nudges a day or during quiet hours.
- [ ] Nudge copy contains only numbers from its payload; template fallback works with Gemini off.
- [ ] Tapping a nudge (push or inbox) opens a chat already about that nudge, with "Why am I seeing this?".
- [ ] Mark as paid, update balance, recategorise and dismiss all change what Ember says next.
- [ ] Budgets and goals can be set; Ember can propose one and the user confirms.
- [ ] Recommender can switch to real spend and back.
- [ ] Activity log and data deletion work.
- [ ] Demo mode produces the six demo nudges described in Section 13 on an iPhone in Expo Go.
- [ ] All tests and evals pass; `docs/EVALS.md` and `docs/RUNNING.md` updated.

---

## 17. Order of work and checkpoints

Commit after each:

1. Read Step 0/1 docs, AUDIT, DECISIONS; note anything that changed since → append to `docs/AUDIT.md`
2. Schema + migrations (Section 4)
3. Synthetic statement generator + fixtures
4. Decrypt/extract + structured extraction + reconciliation + tests
5. Categorisation (rules, normaliser, cache, AI batch, overrides) + tests
6. Card matching + parse/confirm API + consent → **checkpoint: upload a fake statement from the iPhone and see it saved**
7. `buildFinancialState` + tests + `/api/state`
8. Nudge rules + engine + cap/quiet hours/suppression + tests
9. Nudge copy (Gemini + validation + templates) + push registration + Expo push + local-notification fallback + cron
10. Ember tools + nudge chat + "why" + evals
11. Mobile: Home rebuild, upload flow, My cards + card detail
12. Mobile: inbox, nudge chat, budgets & goals, activity, privacy & data
13. Recommender sync with real spend
14. Demo loader + time travel → **checkpoint: full demo on iPhone**
15. Statement eval on fixtures (and on private real statements if present, reporting only accuracy), docs, full acceptance pass → **done**

If something blocks you, pick the simplest option that keeps the acceptance criteria true, write it in `docs/DECISIONS.md`, and continue. Ask the founder only for things you cannot decide yourself (keys, Vercel access, whether to test on their own real statements).
