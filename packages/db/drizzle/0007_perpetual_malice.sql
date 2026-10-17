CREATE TABLE "rental_blocked_dates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_extras" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" bigint DEFAULT 0 NOT NULL,
	"pricing" text DEFAULT 'per_stay' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_rate_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_type_id" uuid,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"weekdays" jsonb,
	"mode" text DEFAULT 'percent' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_stays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"unit_type_id" uuid NOT NULL,
	"customer_id" uuid,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"guests" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'online' NOT NULL,
	"nightly" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"room_total" bigint DEFAULT 0 NOT NULL,
	"extra_guest_total" bigint DEFAULT 0 NOT NULL,
	"extras_total" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_id" uuid,
	"access_key" text NOT NULL,
	"unit_number" text,
	"note" text,
	"internal_note" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hold_until" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_unit_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_guests" integer DEFAULT 2 NOT NULL,
	"max_guests" integer DEFAULT 2 NOT NULL,
	"beds" text,
	"size_sqm" integer,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"base_price" bigint DEFAULT 0 NOT NULL,
	"extra_guest_price" bigint DEFAULT 0 NOT NULL,
	"min_nights" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_blocked_dates" ADD CONSTRAINT "rental_blocked_dates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_blocked_dates" ADD CONSTRAINT "rental_blocked_dates_unit_type_id_rental_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."rental_unit_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_extras" ADD CONSTRAINT "rental_extras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rate_rules" ADD CONSTRAINT "rental_rate_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rate_rules" ADD CONSTRAINT "rental_rate_rules_unit_type_id_rental_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."rental_unit_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_stays" ADD CONSTRAINT "rental_stays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_stays" ADD CONSTRAINT "rental_stays_unit_type_id_rental_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."rental_unit_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_stays" ADD CONSTRAINT "rental_stays_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_unit_types" ADD CONSTRAINT "rental_unit_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_blocked_dates_uq" ON "rental_blocked_dates" USING btree ("tenant_id","unit_type_id","date");--> statement-breakpoint
CREATE INDEX "rental_extras_tenant_idx" ON "rental_extras" USING btree ("tenant_id","sort");--> statement-breakpoint
CREATE INDEX "rental_rate_rules_tenant_idx" ON "rental_rate_rules" USING btree ("tenant_id","unit_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_stays_tenant_number_uq" ON "rental_stays" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "rental_stays_type_dates_idx" ON "rental_stays" USING btree ("tenant_id","unit_type_id","check_in","check_out");--> statement-breakpoint
CREATE INDEX "rental_stays_customer_idx" ON "rental_stays" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "rental_stays_status_idx" ON "rental_stays" USING btree ("tenant_id","status","check_in");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_unit_types_tenant_slug_uq" ON "rental_unit_types" USING btree ("tenant_id","slug");