CREATE TABLE "event_promo_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid,
	"code" text NOT NULL,
	"kind" text DEFAULT 'percent' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"used" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"doors_open" timestamp with time zone,
	"capacity" integer,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"description" text,
	"cover" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text,
	"venue_name" text,
	"venue_address" text,
	"venue_map_url" text,
	"organizer" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"customer_id" uuid,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"refunded_amount" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'online' NOT NULL,
	"promo_code" text,
	"payment_id" uuid,
	"access_key" text NOT NULL,
	"note" text,
	"internal_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hold_until" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"price" bigint DEFAULT 0 NOT NULL,
	"quantity" integer,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"min_per_order" integer DEFAULT 1 NOT NULL,
	"max_per_order" integer DEFAULT 10 NOT NULL,
	"sales_start" timestamp with time zone,
	"sales_end" timestamp with time zone,
	"visibility" text DEFAULT 'public' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"ticket_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"holder_name" text NOT NULL,
	"holder_email" text,
	"seat_label" text,
	"price" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" text,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_promo_codes" ADD CONSTRAINT "event_promo_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_promo_codes" ADD CONSTRAINT "event_promo_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_session_id_event_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."event_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_session_id_event_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."event_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_session_id_event_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."event_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_promo_codes_tenant_code_uq" ON "event_promo_codes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "event_sessions_event_idx" ON "event_sessions" USING btree ("tenant_id","event_id","starts_at");--> statement-breakpoint
CREATE INDEX "event_sessions_tenant_status_starts_idx" ON "event_sessions" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_tenant_slug_uq" ON "events" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "events_tenant_status_starts_idx" ON "events" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "events_tenant_category_idx" ON "events" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_orders_tenant_number_uq" ON "ticket_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "ticket_orders_event_status_idx" ON "ticket_orders" USING btree ("tenant_id","event_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ticket_orders_customer_idx" ON "ticket_orders" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_orders_status_hold_idx" ON "ticket_orders" USING btree ("tenant_id","status","hold_until");--> statement-breakpoint
CREATE INDEX "ticket_types_event_idx" ON "ticket_types" USING btree ("tenant_id","event_id","sort");--> statement-breakpoint
CREATE INDEX "ticket_types_session_idx" ON "ticket_types" USING btree ("tenant_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_tenant_code_uq" ON "tickets" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "tickets_event_session_status_idx" ON "tickets" USING btree ("tenant_id","event_id","session_id","status");--> statement-breakpoint
CREATE INDEX "tickets_type_idx" ON "tickets" USING btree ("tenant_id","ticket_type_id");