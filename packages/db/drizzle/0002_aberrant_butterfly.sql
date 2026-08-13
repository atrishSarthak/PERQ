ALTER TABLE "cards" ADD COLUMN "origin" text DEFAULT 'seeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "search_bucket_key" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "source_urls" jsonb;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "card_source_mode" text DEFAULT 'db_fallback' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "last_card_source_mode" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "last_search_bucket_key" text;--> statement-breakpoint
CREATE INDEX "cards_bucket_lookup_idx" ON "cards" USING btree ("origin","search_bucket_key","status");