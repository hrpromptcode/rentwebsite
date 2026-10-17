ALTER TABLE "availability_rules" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_rules_service_idx" ON "availability_rules" USING btree ("tenant_id","service_id","weekday");