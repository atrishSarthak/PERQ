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
