ALTER TABLE "cards" ADD COLUMN "card_type" text DEFAULT 'unsecured' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "fd_min_amount" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "lifetime_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "networks" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "upi_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "reward_caps" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "cap_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "bucket" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "reward_notes" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "min_age" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "eligible_occupations" text[];--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "min_monthly_income" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "fee_waiver_spend" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "waiver_excludes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "welcome_benefit_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;