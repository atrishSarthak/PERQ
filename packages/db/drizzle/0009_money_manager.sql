CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"ref_table" text,
	"ref_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"month" text,
	"total_limit" integer,
	"category_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" text,
	"issuer" text NOT NULL,
	"card_label" text NOT NULL,
	"last4" text NOT NULL,
	"statement_day" integer,
	"due_day" integer,
	"credit_limit" integer,
	"fee_anniversary_month" integer,
	"current_balance_override" integer,
	"current_balance_updated_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"granted" boolean NOT NULL,
	"notice_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_state_cache" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"state" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_categories" (
	"merchant_normalized" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nudges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"card_account_id" text,
	"priority" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"body_source" text DEFAULT 'template' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"acted_at" timestamp,
	"dismissed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expo_token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_expo_token_unique" UNIQUE("expo_token")
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" integer NOT NULL,
	"target_date" date,
	"saved_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_account_id" text NOT NULL,
	"statement_date" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"due_date" date,
	"total_due" integer,
	"minimum_due" integer,
	"previous_balance" integer,
	"payments_credits" integer,
	"purchases_debits" integer,
	"fees_charges" integer,
	"finance_charges" integer,
	"credit_limit" integer,
	"available_limit" integer,
	"points_opening" integer,
	"points_earned" integer,
	"points_redeemed" integer,
	"points_closing" integer,
	"points_expiring" integer,
	"points_expiry_date" date,
	"marked_paid_at" timestamp,
	"reconciled" boolean DEFAULT false NOT NULL,
	"reconcile_diff" integer,
	"parser_version" text NOT NULL,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"card_account_id" text NOT NULL,
	"txn_date" date NOT NULL,
	"description_raw" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"amount" integer NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"category_source" text NOT NULL,
	"is_international" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_merchant_overrides" (
	"user_id" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"category" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_merchant_overrides_user_id_merchant_normalized_pk" PRIMARY KEY("user_id","merchant_normalized")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "thread_ref" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "spend_source" text DEFAULT 'quiz' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "synced_spend" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_accounts" ADD CONSTRAINT "card_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_accounts" ADD CONSTRAINT "card_accounts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_state_cache" ADD CONSTRAINT "financial_state_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_merchant_overrides" ADD CONSTRAINT "user_merchant_overrides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_created_idx" ON "activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_month_idx" ON "budgets" USING btree ("user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "card_accounts_user_issuer_last4_idx" ON "card_accounts" USING btree ("user_id","issuer","last4");--> statement-breakpoint
CREATE INDEX "consents_user_source_idx" ON "consents" USING btree ("user_id","source","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nudges_user_dedupe_idx" ON "nudges" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "nudges_user_sent_idx" ON "nudges" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "nudges_user_status_idx" ON "nudges" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "savings_goals_user_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_card_date_idx" ON "statements" USING btree ("card_account_id","statement_date");--> statement-breakpoint
CREATE INDEX "statements_user_date_idx" ON "statements" USING btree ("user_id","statement_date");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","txn_date");--> statement-breakpoint
CREATE INDEX "transactions_statement_idx" ON "transactions" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "transactions_user_merchant_idx" ON "transactions" USING btree ("user_id","merchant_normalized");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_ref_idx" ON "chat_messages" USING btree ("user_id","thread_ref");