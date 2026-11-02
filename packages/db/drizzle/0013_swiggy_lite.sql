CREATE TABLE "swiggy_carts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"external_cart_id" text NOT NULL,
	"budget" integer NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_total" integer NOT NULL,
	"fees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" integer NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swiggy_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swiggy_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"service" text NOT NULL,
	"ordered_at" timestamp NOT NULL,
	"restaurant" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_total" integer NOT NULL,
	"fees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "swiggy_carts" ADD CONSTRAINT "swiggy_carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swiggy_connections" ADD CONSTRAINT "swiggy_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swiggy_orders" ADD CONSTRAINT "swiggy_orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "swiggy_orders_user_external_idx" ON "swiggy_orders" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "swiggy_orders_user_idx" ON "swiggy_orders" USING btree ("user_id","ordered_at");