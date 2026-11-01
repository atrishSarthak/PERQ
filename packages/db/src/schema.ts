import {
  pgTable,
  bigint,
  boolean,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";

// --- Auth.js-managed tables (Drizzle adapter contract) ---
// PRD §6: Auth.js (NextAuth), Drizzle adapter, Postgres-backed sessions.

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // bcrypt hash, nullable — null for a future Google-OAuth-only user (PRD §6
  // suggests email/password to start, Google OAuth as an easy low-friction
  // add later; not a blocking decision either way).
  passwordHash: text("password_hash"),
  // Step 2 demo mode: only demo users can be reset or time-travelled.
  isDemo: boolean("is_demo").notNull().default(false),
  // Demo time travel (Step 2 §13.4): ms added to the real clock for this demo user only.
  demoClockOffsetMs: bigint("demo_clock_offset_ms", { mode: "number" }),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    pk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// --- Feature 1 domain tables (PRD §5, locked by Engineering Plan §1) ---

export const userProfile = pgTable("user_profile", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // 13 quiz answers, keyed by question_key. See packages/scoring-engine for
  // the domain types this jsonb blob is expected to conform to.
  answers: jsonb("answers").notNull(),
  // D15: which card set the user's LATEST recommendation compute actually
  // used — 'web_search' | 'db_fallback' | null (never computed yet). The
  // results page reads this (+ lastSearchBucketKey) to scope its "browse
  // all cards" query to exactly the set that was scored, not every active
  // row in the whole cards table (which now spans many buckets/users).
  lastCardSourceMode: text("last_card_source_mode"),
  lastSearchBucketKey: text("last_search_bucket_key"),
  // Step 2 §9: which spend the recommender uses. 'quiz' = bucket estimates
  // from answers; 'statements' = averaged real spend in synced_spend
  // ({ monthly: Record<category, ₹>, statementCount, dataThrough }).
  spendSource: text("spend_source").notNull().default("quiz"),
  syncedSpend: jsonb("synced_spend"),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow(),
});

// cards.status: soft-delete (2C). A card the seed script no longer finds in
// source data is marked 'discontinued', never hard-deleted — arsenal and
// recommendation history stay intact instead of hitting a dangling reference.
// The same soft-delete pattern is reused by D15's bucket refresh below.
export const cards = pgTable(
  "cards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    issuer: text("issuer").notNull(),
    network: text("network").notNull(), // 'Visa' | 'Mastercard' | 'RuPay' | 'Amex'
    tier: text("tier"),
    joiningFee: numeric("joining_fee").notNull(),
    annualFee: numeric("annual_fee").notNull(),
    feeWaiverCondition: text("fee_waiver_condition"),
    // per category: dining, travel, hotels, fuel, groceries, e-commerce, utilities, general
    rewardRates: jsonb("reward_rates").notNull(),
    milestoneBenefits: jsonb("milestone_benefits"),
    welcomeBonus: text("welcome_bonus"),
    loungeAccess: jsonb("lounge_access"),
    forexMarkupPct: numeric("forex_markup_pct"),
    redemptionValue: numeric("redemption_value"), // ₹ per point
    minIncomeEligibility: numeric("min_income_eligibility"),
    coBrandPartner: text("co_brand_partner"),
    status: text("status").notNull().default("active"), // 'active' | 'discontinued' (2C)
    sourceUpdatedAt: timestamp("source_updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    // D15: 'seeded' (the curated fallback catalog, PRD §7) | 'web_search'
    // (Ember's live Gemini-grounded search results). searchBucketKey
    // partitions web_search rows by the coarse profile shape
    // (computeSearchBucketKey) they were searched for — null for seeded
    // rows. sourceUrls carries the citation URLs a web_search row's terms
    // were extracted from (never set for seeded rows) — required at
    // extraction time (cardSearchSchema) so no web-sourced fact reaches
    // scoring ungrounded.
    origin: text("origin").notNull().default("seeded"),
    searchBucketKey: text("search_bucket_key"),
    sourceUrls: jsonb("source_urls"),

    // --- Card Recommender v2 (handoff §1.2). reward_rates above now holds
    // the 9-category v2 shape: % value back per category, already converted
    // from points with redemption_value. Every rupee computed from these
    // goes through packages/finance-engine.
    cardType: text("card_type").notNull().default("unsecured"), // 'secured' | 'unsecured'
    fdMinAmount: integer("fd_min_amount"), // ₹, secured cards only
    lifetimeFree: boolean("lifetime_free").notNull().default(false),
    networks: text("networks").array().notNull().default([]), // e.g. ['RuPay','Visa']
    upiEnabled: boolean("upi_enabled").notNull().default(false), // RuPay credit on UPI
    rewardCaps: jsonb("reward_caps").notNull().default({}), // per category (+ 'total'), ₹/month of reward
    capGroups: jsonb("cap_groups").notNull().default([]), // [{ categories, monthlyCap, label }]
    bucket: text("bucket"), // catalogue segment: secured | lifetime_free | entry_cashback | rupay_upi | mid_tier
    rewardNotes: text("reward_notes"),
    minAge: integer("min_age"),
    eligibleOccupations: text("eligible_occupations").array(), // null = any
    minMonthlyIncome: integer("min_monthly_income"), // ₹ take-home/month, null = not published
    feeWaiverSpend: integer("fee_waiver_spend"), // ₹/yr that waives the renewal fee
    waiverExcludes: text("waiver_excludes").array().notNull().default([]),
    welcomeBenefitValue: integer("welcome_benefit_value").notNull().default(0),
    sourceUrl: text("source_url"), // the bank's own product / MITC page
    verified: boolean("verified").notNull().default(false), // false = excluded from ranking
  },
  (t) => ({
    // D15 bucket-cache lookup: WHERE origin = ? AND search_bucket_key = ? AND status = ?
    bucketLookupIdx: index("cards_bucket_lookup_idx").on(
      t.origin,
      t.searchBucketKey,
      t.status
    ),
  })
);

// recommendations write path is delete-and-replace per user on every
// quiz-submit / profile-edit re-score (D14) — never a blind insert, so a
// double-submit can't create duplicate/stale rows. profile_hash + cards_version
// together are the explanation cache key (D6, D10).
export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    rank: integer("rank").notNull(),
    score: numeric("score").notNull(),
    explanation: text("explanation").notNull(),
    agent: text("agent").notNull().default("Ember"),
    // the exact user_profile.answers this recommendation was computed from —
    // keeps a past recommendation explainable even after later profile edits.
    profileSnapshot: jsonb("profile_snapshot").notNull(),
    // sha256 of normalized answers jsonb (D6)
    profileHash: text("profile_hash").notNull(),
    // max(source_updated_at) across active cards at compute time (D10) —
    // invalidates the cache when card data changes underneath an unchanged profile.
    cardsVersion: text("cards_version").notNull(),
    // 'gemini' | 'fallback_template' (D7) | 'template' — backend-only, no
    // UI surface (DR2). 'template' marks rank>1 rows, which by design never
    // attempt a Gemini call (only the #1 pick gets the rich explanation,
    // Perf-B/D9's cost-guardrail spirit) — distinct from 'fallback_template',
    // which means Gemini genuinely failed for the #1 pick.
    explanationSource: text("explanation_source").notNull().default("gemini"),
    // D15: 'web_search' | 'db_fallback' — which card set this recommendation
    // was scored against. Auditable the same way explanationSource already
    // tracks D7's fallback; distinct concern (card SOURCING vs explanation
    // GENERATION can fail independently).
    cardSourceMode: text("card_source_mode").notNull().default("db_fallback"),
    // Card Recommender v2 (handoff §7): the finance-engine figures this row
    // was ranked on, so a past explanation stays checkable against its numbers.
    year1Value: integer("year1_value"),
    ongoingValue: integer("ongoing_value"),
    breakdown: jsonb("breakdown"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    // D6/D10 cache lookup: WHERE user_id = ? AND profile_hash = ? AND cards_version = ?
    cacheLookupIdx: index("recommendations_cache_lookup_idx").on(
      t.userId,
      t.profileHash,
      t.cardsVersion
    ),
    userIdx: index("recommendations_user_idx").on(t.userId),
  })
);

export const userCardArsenal = pgTable(
  "user_card_arsenal",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    status: text("status").notNull(), // 'held' | 'not_held'
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // one row per (user, card) — quiz Q1 and the results-page toggle are the
    // same underlying mutation, upserted on this pair (PRD §12).
    userCardUnique: uniqueIndex("user_card_arsenal_user_card_idx").on(
      t.userId,
      t.cardId
    ),
  })
);

// --- Feature 3 domain tables (Engineering Plan §1, D1-D9) ---

// One row per goal search, append-only (unlike recommendations' delete-
// and-replace, D14) — every search is its own attempt, not "current state"
// (PRD §16: no persistent goal history/dashboard, so nothing reads this
// table beyond the single most-recent row for the immediate result).
export const goals = pgTable(
  "goals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalText: text("goal_text").notNull(),
    // One of the 8 SpendCategory values (dining/travel/hotels/fuel/
    // groceries/ecommerce/utilities/general — @perq/scoring-engine's
    // SpendCategory, the same taxonomy cards.rewardRates uses everywhere
    // else) | 'unsupported' | 'pending'. 'pending' is the transient state
    // between the row being written (the rate-limit check must happen
    // before ANY spend, including understanding the goal) and
    // understandGoal resolving; 'unsupported' is an honest, queryable
    // outcome, not null (a real, expected result, not an error state to
    // hide). Stored as text, not a Postgres enum, at the app layer only —
    // no DB constraint to migrate when the value set changes.
    category: text("category").notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    // D8: rate-limit COUNT query — WHERE user_id = ? AND created_at >= ?
    // (today, UTC calendar day).
    userCreatedIdx: index("goals_user_created_idx").on(t.userId, t.createdAt),
  })
);

// v2 (open-ended web-search redesign): the shared cross-user
// channel_fetch_cache table (keyed on a fixed 6-channel enum) was dropped
// outright, not redesigned around a new key shape. It existed for a design
// with exactly 6 URLs and real cross-user reuse; open-ended per-goal
// discovery produces near-unique queries/URLs per user, so a shared cache's
// hit rate collapses toward zero while the new cost driver (Gemini quota)
// isn't touched by a page-fetch cache at all. Revisit only if real usage
// later shows repeat-goal patterns worth caching.

// One row per completed goal search that produced a real recommendation —
// the total-failure path (discovery/search itself hard-fails) writes NO row
// here (nothing to recommend), even though the goals row above still exists
// and still counted against the rate-limit cap.
export const goalRecommendations = pgTable(
  "goal_recommendations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Legacy column name from the v1 fixed-channel design, kept as-is
    // (no rename migration) — now holds a free-text, human-readable
    // source/site label (e.g. "Ticketmaster", "Amazon.in") rather than a
    // fixed enum value.
    recommendedChannel: text("recommended_channel").notNull(),
    // The actual listing URL discovered for the winning option — lets the
    // results page link out to the real page, not just name it.
    recommendedSourceUrl: text("recommended_source_url"),
    recommendedCardId: text("recommended_card_id").references(() => cards.id),
    // 'card' | 'no_card' | 'bnpl' — explicit discriminant since
    // recommendedCardId is null for both 'no_card' and 'bnpl'.
    paymentMethod: text("payment_method").notNull().default("no_card"),
    // Set only when paymentMethod = 'bnpl' — either a real, citation-backed
    // BNPL-provider fact found during discovery, or a generic honest
    // advisory sentence. Distinct from billingCycleNote (card-float-
    // specific).
    bnplNote: text("bnpl_note"),
    // A real, citation-backed card/bank/payment-platform offer found during
    // discovery, if any — never a fabricated or guessed offer.
    cardOfferNote: text("card_offer_note"),
    cardOfferCitationUrl: text("card_offer_citation_url"),
    // e.g. "wait 3 days — your statement closes then" — null when the
    // deterministic billing-cycle rules don't produce a note (missing
    // financial-context fields, or no float/utilization consideration
    // applies for this purchase).
    billingCycleNote: text("billing_cycle_note"),
    explanation: text("explanation").notNull(),
    // Which discovered offers had a confirmed price vs. an unconfirmed one —
    // the "show the work" transparency requirement. Shape:
    // { source: string, sourceUrl: string, outcome: 'succeeded' | 'unconfirmed_price', price?: number }[]
    channelsChecked: jsonb("channels_checked").notNull(),
    agent: text("agent").notNull().default("Ember"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    // "most recent search result for this user" lookup (/goal/results) —
    // no persistent history UI reads beyond the single latest row (PRD §16).
    userCreatedIdx: index("goal_recommendations_user_created_idx").on(
      t.userId,
      t.createdAt
    ),
  })
);

// chat_messages is keyed to user_id, not a specific recommendation snapshot
// (D11) — a chat thread always reasons from the user's LATEST recommendations,
// so a profile edit mid-conversation isn't an orphan/reset case.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant'
    content: text("content").notNull(),
    // Conversation thread (handoff §1.4): 'recommender' for the card chat.
    thread: text("thread").notNull().default("recommender"),
    // Step 2: ties a conversation to one object, e.g. 'nudge:<id>' or 'card:<id>'.
    threadRef: text("thread_ref"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("chat_messages_user_idx").on(t.userId, t.createdAt),
    threadRefIdx: index("chat_messages_thread_ref_idx").on(t.userId, t.threadRef),
  })
);

// --- Ember agent runs (handoff §0.4) ---
// One row per runEmber call, written by apps/web/lib/ember/agentRunLog.ts.
// user_id is nullable: the public card finder runs Ember without a login.
// steps: [{ tool, input, outputSummary, ms, status, narration }].
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    steps: jsonb("steps").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    status: text("status").notNull(), // 'ok' | 'fallback' | 'capped' | 'banned_phrase_fallback'
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("agent_runs_user_created_idx").on(t.userId, t.createdAt),
  })
);


// ===========================================================================
// Step 2: Money Manager (docs/specs/PERQ_Handoff_Step2_Money_Manager.md §4).
// Money is integer rupees. Statement PDFs and passwords are NEVER stored:
// only the structured figures and transaction lines extracted from them.
// Enum-like text columns are validated by zod in packages/shared/src/money.ts.
// ===========================================================================

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const userRef = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { mode: "date" }).notNull().defaultNow();

export const cardAccounts = pgTable(
  "card_accounts",
  {
    id: id(),
    userId: userRef(),
    // Catalogue card this account is (null when the user's card isn't in the
    // catalogue: rupee rules that need card terms skip it).
    cardId: text("card_id").references(() => cards.id, { onDelete: "set null" }),
    issuer: text("issuer").notNull(),
    cardLabel: text("card_label").notNull(),
    last4: text("last4").notNull(),
    statementDay: integer("statement_day"), // 1–31
    dueDay: integer("due_day"), // 1–31
    creditLimit: integer("credit_limit"),
    feeAnniversaryMonth: integer("fee_anniversary_month"), // 1–12
    // "Update current balance": drives utilisation until the next statement.
    currentBalanceOverride: integer("current_balance_override"),
    currentBalanceUpdatedAt: timestamp("current_balance_updated_at", { mode: "date" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({
    userCardIdx: uniqueIndex("card_accounts_user_issuer_last4_idx").on(t.userId, t.issuer, t.last4),
  })
);

export const statements = pgTable(
  "statements",
  {
    id: id(),
    userId: userRef(),
    cardAccountId: text("card_account_id")
      .notNull()
      .references(() => cardAccounts.id, { onDelete: "cascade" }),
    statementDate: date("statement_date").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    dueDate: date("due_date"),
    totalDue: integer("total_due"),
    minimumDue: integer("minimum_due"),
    previousBalance: integer("previous_balance"),
    paymentsCredits: integer("payments_credits"),
    purchasesDebits: integer("purchases_debits"),
    feesCharges: integer("fees_charges"),
    financeCharges: integer("finance_charges"),
    creditLimit: integer("credit_limit"),
    availableLimit: integer("available_limit"),
    // Printed points block; every field null when the statement doesn't print it.
    pointsOpening: integer("points_opening"),
    pointsEarned: integer("points_earned"),
    pointsRedeemed: integer("points_redeemed"),
    pointsClosing: integer("points_closing"),
    pointsExpiring: integer("points_expiring"),
    pointsExpiryDate: date("points_expiry_date"),
    // "Mark as paid": a flag only, no money moves. Silences due nudges.
    markedPaidAt: timestamp("marked_paid_at", { mode: "date" }),
    reconciled: boolean("reconciled").notNull().default(false),
    reconcileDiff: integer("reconcile_diff"),
    parserVersion: text("parser_version").notNull(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => ({
    // Re-uploading the same statement replaces it (§4).
    cardDateIdx: uniqueIndex("statements_card_date_idx").on(t.cardAccountId, t.statementDate),
    userDateIdx: index("statements_user_date_idx").on(t.userId, t.statementDate),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: userRef(),
    statementId: text("statement_id")
      .notNull()
      .references(() => statements.id, { onDelete: "cascade" }),
    cardAccountId: text("card_account_id")
      .notNull()
      .references(() => cardAccounts.id, { onDelete: "cascade" }),
    txnDate: date("txn_date").notNull(),
    // Full card numbers are stripped before insert (§12); last 4 at most.
    descriptionRaw: text("description_raw").notNull(),
    merchantNormalized: text("merchant_normalized").notNull(),
    amount: integer("amount").notNull(), // ₹, always positive; see direction
    direction: text("direction").notNull(), // 'debit' | 'credit'
    kind: text("kind").notNull(), // purchase | payment | refund | fee | interest | emi | cashback | other
    category: text("category").notNull(), // 17 spend categories (packages/shared money.ts)
    categorySource: text("category_source").notNull(), // rule | cache | ai | user
    isInternational: boolean("is_international").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({
    userDateIdx: index("transactions_user_date_idx").on(t.userId, t.txnDate),
    statementIdx: index("transactions_statement_idx").on(t.statementId),
    userMerchantIdx: index("transactions_user_merchant_idx").on(t.userId, t.merchantNormalized),
  })
);

// Shared across users: merchant name → category only, never personal data.
export const merchantCategories = pgTable("merchant_categories", {
  merchantNormalized: text("merchant_normalized").primaryKey(),
  category: text("category").notNull(),
  source: text("source").notNull(), // 'rule' | 'ai'
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// A user's own recategorisations, remembered for their future statements and
// never written to the shared cache (§5.5).
export const userMerchantOverrides = pgTable(
  "user_merchant_overrides",
  {
    userId: userRef(),
    merchantNormalized: text("merchant_normalized").notNull(),
    category: text("category").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.merchantNormalized] }) })
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    userId: userRef(),
    month: text("month"), // 'YYYY-MM'; null = the recurring default (one per user, enforced in code)
    totalLimit: integer("total_limit"),
    categoryLimits: jsonb("category_limits").notNull().default({}), // { category: ₹ }
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ userMonthIdx: uniqueIndex("budgets_user_month_idx").on(t.userId, t.month) })
);

// Named savings_goals: `goals` is the retired Feature 3 goal-search table.
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    targetAmount: integer("target_amount").notNull(),
    targetDate: date("target_date"),
    savedAmount: integer("saved_amount").notNull().default(0),
    status: text("status").notNull().default("active"), // active | done | archived
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("savings_goals_user_idx").on(t.userId) })
);

export const nudges = pgTable(
  "nudges",
  {
    id: id(),
    userId: userRef(),
    ruleId: text("rule_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    cardAccountId: text("card_account_id").references(() => cardAccounts.id, { onDelete: "set null" }),
    priority: integer("priority").notNull(),
    payload: jsonb("payload").notNull(), // the exact numbers the rule computed
    title: text("title").notNull(),
    body: text("body").notNull(),
    bodySource: text("body_source").notNull().default("template"), // 'ai' | 'template'
    why: text("why"), // the rule's plain-English explanation at creation time
    status: text("status").notNull().default("queued"), // queued|sent|opened|acted|dismissed|expired|suppressed
    scheduledFor: timestamp("scheduled_for", { mode: "date" }),
    sentAt: timestamp("sent_at", { mode: "date" }),
    openedAt: timestamp("opened_at", { mode: "date" }),
    actedAt: timestamp("acted_at", { mode: "date" }),
    dismissedAt: timestamp("dismissed_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => ({
    dedupeIdx: uniqueIndex("nudges_user_dedupe_idx").on(t.userId, t.dedupeKey),
    sentIdx: index("nudges_user_sent_idx").on(t.userId, t.sentAt),
    statusIdx: index("nudges_user_status_idx").on(t.userId, t.status),
  })
);

export const pushTokens = pgTable("push_tokens", {
  id: id(),
  userId: userRef(),
  expoToken: text("expo_token").notNull().unique(),
  platform: text("platform").notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }).notNull().defaultNow(),
});

// Append-only: the latest row per (user, source) is the current consent; the
// history is shown with dates on the Privacy screen.
export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: userRef(),
    source: text("source").notNull(), // 'statements' | 'notifications'
    granted: boolean("granted").notNull(),
    noticeVersion: text("notice_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ userSourceIdx: index("consents_user_source_idx").on(t.userId, t.source, t.createdAt) })
);

// "What Ember did": summaries are built by code from counts and names,
// never from transaction text or amounts beyond what the user already sees.
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    userId: userRef(),
    type: text("type").notNull(), // statement_parsed | nudge_sent | budget_set | goal_created | ...
    summary: text("summary").notNull(),
    refTable: text("ref_table"),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => ({ userCreatedIdx: index("activity_events_user_created_idx").on(t.userId, t.createdAt) })
);

// financial_state is computed by a pure function; this is only a cache,
// deleted on any write to the user's money data (§4).
export const financialStateCache = pgTable("financial_state_cache", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  computedAt: timestamp("computed_at", { mode: "date" }).notNull().defaultNow(),
  state: jsonb("state").notNull(),
});
