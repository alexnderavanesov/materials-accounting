CREATE TABLE "workspace_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
