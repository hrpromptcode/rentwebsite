ALTER TABLE "customer_otps" ADD COLUMN "ip" text;--> statement-breakpoint
CREATE INDEX "customer_otps_ip_idx" ON "customer_otps" USING btree ("tenant_id","ip","created_at");