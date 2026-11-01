CREATE TABLE "purchase_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"price" integer NOT NULL,
	"merchant" text,
	"source" text NOT NULL,
	"need_by_date" date,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emi_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inputs_snapshot" jsonb,
	"result" jsonb,
	"verdict" text,
	"explanation" text,
	"explanation_source" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"remind_at" date,
	"matched_transaction_id" text,
	"agent_run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "emi_rewards" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_plans" ADD CONSTRAINT "purchase_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_plans" ADD CONSTRAINT "purchase_plans_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_plans_user_idx" ON "purchase_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_plans_user_status_idx" ON "purchase_plans" USING btree ("user_id","status");