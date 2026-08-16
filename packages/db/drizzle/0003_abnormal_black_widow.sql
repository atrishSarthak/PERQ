CREATE TABLE "channel_fetch_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"query_key" text NOT NULL,
	"extracted_data" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"recommended_channel" text NOT NULL,
	"recommended_card_id" text,
	"billing_cycle_note" text,
	"explanation" text NOT NULL,
	"channels_checked" jsonb NOT NULL,
	"agent" text DEFAULT 'MIMIR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_text" text NOT NULL,
	"category" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD CONSTRAINT "goal_recommendations_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD CONSTRAINT "goal_recommendations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_recommendations" ADD CONSTRAINT "goal_recommendations_recommended_card_id_cards_id_fk" FOREIGN KEY ("recommended_card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_fetch_cache_channel_query_key_idx" ON "channel_fetch_cache" USING btree ("channel","query_key");--> statement-breakpoint
CREATE INDEX "goal_recommendations_user_created_idx" ON "goal_recommendations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_created_idx" ON "goals" USING btree ("user_id","created_at");