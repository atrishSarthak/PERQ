import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
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
    // (MIMIR's live Gemini-grounded search results). searchBucketKey
    // partitions web_search rows by the coarse profile shape
    // (computeSearchBucketKey) they were searched for — null for seeded
    // rows. sourceUrls carries the citation URLs a web_search row's terms
    // were extracted from (never set for seeded rows) — required at
    // extraction time (cardSearchSchema) so no web-sourced fact reaches
    // scoring ungrounded.
    origin: text("origin").notNull().default("seeded"),
    searchBucketKey: text("search_bucket_key"),
    sourceUrls: jsonb("source_urls"),
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
    agent: text("agent").notNull().default("MIMIR"),
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
    // 'movie' | 'attraction' | 'electronics' | 'unsupported' | 'pending' —
    // 'pending' is the transient state between the row being written (D8's
    // rate-limit check must happen before ANY spend, including
    // classification) and classifyGoal resolving; 'unsupported' is an
    // honest, queryable outcome (D6), not null (PRD §8: a real, expected
    // result, not an error state to hide).
    category: text("category").notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    // D8: rate-limit COUNT query — WHERE user_id = ? AND created_at >= ?
    // (today, UTC calendar day).
    userCreatedIdx: index("goals_user_created_idx").on(t.userId, t.createdAt),
  })
);

// Shared across users, NOT per-user (PRD §5) — the raw facts a channel
// returns don't depend on who's asking, only the final recommendation does
// (computed fresh per user from this cache in goal_recommendations below).
// Never receives financial-context input (D2) — that's what structurally
// prevents the stale-cache-across-different-financial-contexts edge case.
export const channelFetchCache = pgTable(
  "channel_fetch_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // One of the 6 fixed channels (apps/web/lib/goals/channels.ts owns the
    // enum) — stored as text since Drizzle/Postgres enums would require a
    // migration to extend, and the fixed-6 guarantee is already enforced at
    // the TypeScript/application layer (D2), not the DB layer.
    channel: text("channel").notNull(),
    // Normalized, date-scoped search terms (D3) — e.g.
    // "movie:oppenheimer:bangalore:2026-08-16". Date-scoping prevents
    // serving Tuesday's showtimes on Friday.
    queryKey: text("query_key").notNull(),
    // Structured listing(s) from that channel for that query — shape
    // defined by apps/web/lib/goals/extractionSchema.ts (D5). Only ever
    // written for a 'succeeded' or 'checked_empty' outcome (D5) — a
    // 'failed' fetch/extraction never reaches this table at all.
    extractedData: jsonb("extracted_data").notNull(),
    // D5: 'succeeded' | 'checked_empty' — never 'failed' (failed fetches
    // aren't cached, there's nothing useful to reuse).
    outcome: text("outcome").notNull(),
    fetchedAt: timestamp("fetched_at", { mode: "date" }).notNull().defaultNow(),
    // Per-category TTL (D3) — computed by the caller (movies/attractions
    // ~4-6h, electronics ~24h) and stored as an absolute time so a read
    // is a single `expires_at > now()` comparison, not a recomputation.
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  },
  (t) => ({
    // D7: unique index backing onConflictDoUpdate — a losing racer's insert
    // becomes a harmless update instead of a duplicate row or a constraint
    // error. Also the read-path lookup index.
    channelQueryKeyIdx: uniqueIndex("channel_fetch_cache_channel_query_key_idx").on(
      t.channel,
      t.queryKey
    ),
  })
);

// One row per completed goal search that produced a real recommendation —
// D9's total-failure path (both channels fail) writes NO row here (nothing
// to recommend), even though the goals row above still exists and still
// counted against D8's cap.
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
    recommendedChannel: text("recommended_channel").notNull(),
    recommendedCardId: text("recommended_card_id").references(() => cards.id),
    // e.g. "wait 3 days — your statement closes then" — null when D1's
    // deterministic billing-cycle rules don't produce a note (missing
    // financial-context fields, or no float/utilization consideration
    // applies for this purchase).
    billingCycleNote: text("billing_cycle_note"),
    explanation: text("explanation").notNull(),
    // D5: which channels succeeded/failed/were empty — PRD §10's "show the
    // work" transparency requirement. Shape:
    // { channel: string, outcome: 'failed' | 'checked_empty' | 'succeeded' }[]
    channelsChecked: jsonb("channels_checked").notNull(),
    agent: text("agent").notNull().default("MIMIR"),
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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("chat_messages_user_idx").on(t.userId, t.createdAt),
  })
);
