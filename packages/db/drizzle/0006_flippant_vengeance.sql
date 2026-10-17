CREATE TABLE "cache_invalidations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"keys" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "tenant_domains_hostname_uq";--> statement-breakpoint
CREATE INDEX "cache_invalidations_created_idx" ON "cache_invalidations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_active_hostname_uq" ON "tenant_domains" USING btree ("hostname") WHERE "tenant_domains"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_tenant_host_uq" ON "tenant_domains" USING btree ("tenant_id","hostname");--> statement-breakpoint
CREATE INDEX "tenant_domains_hostname_idx" ON "tenant_domains" USING btree ("hostname");