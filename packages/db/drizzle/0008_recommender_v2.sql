ALTER TABLE "chat_messages" ADD COLUMN "thread" text DEFAULT 'recommender' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "year1_value" integer;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "ongoing_value" integer;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "breakdown" jsonb;