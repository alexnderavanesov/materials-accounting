CREATE TABLE "workspace_commits" (
	"revision" bigint PRIMARY KEY NOT NULL,
	"mutation_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changes" jsonb NOT NULL,
	"groups" jsonb NOT NULL,
	"request_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_groups" (
	"key" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_meta" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" bigint NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_records" (
	"key" text PRIMARY KEY NOT NULL,
	"collection" text NOT NULL,
	"id" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" bigint NOT NULL,
	"position" double precision NOT NULL,
	"links" text[] NOT NULL,
	"unique_keys" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"disabled" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workspace_users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "workspace_sessions" ADD CONSTRAINT "workspace_sessions_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_commits_mutation_idx" ON "workspace_commits" USING btree ("mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_records_collection_id_idx" ON "workspace_records" USING btree ("collection","id");--> statement-breakpoint
CREATE INDEX "workspace_records_links_idx" ON "workspace_records" USING gin ("links");--> statement-breakpoint
CREATE INDEX "workspace_records_unique_keys_idx" ON "workspace_records" USING gin ("unique_keys");