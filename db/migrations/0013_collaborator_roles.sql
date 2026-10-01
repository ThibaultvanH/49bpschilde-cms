ALTER TABLE "collaborator" ADD COLUMN "role" text DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "collaborator" ADD COLUMN "allowed_entries" text;--> statement-breakpoint
ALTER TABLE "collaborator" ADD COLUMN "allowed_branches" text;