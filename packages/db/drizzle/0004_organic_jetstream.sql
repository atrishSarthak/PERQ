DROP TABLE "channel_fetch_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD COLUMN "recommended_source_url" text;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD COLUMN "payment_method" text DEFAULT 'no_card' NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD COLUMN "bnpl_note" text;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD COLUMN "card_offer_note" text;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD COLUMN "card_offer_citation_url" text;