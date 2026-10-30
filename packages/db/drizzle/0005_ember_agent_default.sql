ALTER TABLE "goal_recommendations" ALTER COLUMN "agent" SET DEFAULT 'Ember';--> statement-breakpoint
ALTER TABLE "recommendations" ALTER COLUMN "agent" SET DEFAULT 'Ember';--> statement-breakpoint
UPDATE "goal_recommendations" SET "agent" = 'Ember' WHERE "agent" = 'MIMIR';--> statement-breakpoint
UPDATE "recommendations" SET "agent" = 'Ember' WHERE "agent" = 'MIMIR';
