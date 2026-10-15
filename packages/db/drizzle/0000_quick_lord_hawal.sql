CREATE TYPE "public"."domain_kind" AS ENUM('subdomain', 'custom');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verifying', 'active', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'manager', 'staff', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'deleted');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"diff" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"response_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"amount" bigint NOT NULL,
	"vat" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text,
	"provider_ref" text,
	"pdf_url" text,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly" bigint DEFAULT 0 NOT NULL,
	"price_yearly" bigint DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modules_allowed" text[] DEFAULT '{}' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_sub_id" text,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"site_type" text NOT NULL,
	"modules" text[] DEFAULT '{}' NOT NULL,
	"theme_preset" text NOT NULL,
	"preview_image" text,
	"demo_tenant_slug" text,
	"complexity" integer DEFAULT 1 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"kind" "domain_kind" DEFAULT 'custom' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"verification_token" text,
	"ssl_status" text,
	"last_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'staff' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'staff' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"tenant_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_modules_tenant_id_module_key_pk" PRIMARY KEY("tenant_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "tenant_secrets" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_secrets_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenant_usage" (
	"tenant_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_usage_tenant_id_metric_period_pk" PRIMARY KEY("tenant_id","metric","period")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"site_type" text NOT NULL,
	"plan_key" text DEFAULT 'trial' NOT NULL,
	"status" "tenant_status" DEFAULT 'trialing' NOT NULL,
	"locale" text DEFAULT 'th' NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_tenant_id" text,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'th' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_emails" text[] DEFAULT '{}' NOT NULL,
	"success_message" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" text,
	"folder" text DEFAULT '/' NOT NULL,
	"blur_data_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navigation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'page' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_sections" jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"show_in_nav" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" jsonb,
	"body_html" text,
	"cover_image" text,
	"category" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_name" text,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"address" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text,
	"phone" text,
	"line_user_id" text,
	"name" text,
	"avatar" text,
	"password_hash" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"tier" text DEFAULT 'member' NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_record" jsonb,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"coupon_code" text,
	"note" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"type" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"min_subtotal" bigint DEFAULT 0 NOT NULL,
	"max_discount" bigint,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer,
	"applies_to" jsonb,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"name" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"image" text,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"total" bigint NOT NULL,
	"type" text DEFAULT 'physical' NOT NULL,
	"digital_delivery" jsonb,
	"fulfilled_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"email" text,
	"phone" text,
	"customer_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount_total" bigint DEFAULT 0 NOT NULL,
	"shipping_total" bigint DEFAULT 0 NOT NULL,
	"tax_total" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"coupon_code" text,
	"shipping_method_name" text,
	"shipping_method_type" text,
	"shipping_address" jsonb,
	"billing_address" jsonb,
	"customer_note" text,
	"internal_note" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'storefront' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"customer_id" uuid,
	"provider" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" bigint NOT NULL,
	"refunded_amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"provider_ref" text,
	"provider_payload" jsonb,
	"qr_payload" text,
	"slip_url" text,
	"slip_verification" jsonb,
	"slip_trans_ref" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"verified_by" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"option_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sku" text,
	"barcode" text,
	"price" bigint NOT NULL,
	"compare_at_price" bigint,
	"cost_price" bigint,
	"stock" integer DEFAULT 0 NOT NULL,
	"image" text,
	"weight_grams" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"short_description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"type" text DEFAULT 'physical' NOT NULL,
	"category_id" uuid,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price" bigint DEFAULT 0 NOT NULL,
	"compare_at_price" bigint,
	"cost_price" bigint,
	"currency" text DEFAULT 'THB' NOT NULL,
	"has_variants" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"weight_grams" integer DEFAULT 0 NOT NULL,
	"sku" text,
	"barcode" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"digital_asset" jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rating_avg" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"author_name" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reply" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text,
	"tracking_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'flat' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estimated_days" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'closed' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"service_id" uuid NOT NULL,
	"staff_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'online' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"price" bigint DEFAULT 0 NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"note" text,
	"internal_note" text,
	"answers" jsonb,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"rescheduled_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image" text,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"price" bigint DEFAULT 0 NOT NULL,
	"price_note" text,
	"deposit_required" boolean DEFAULT false NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"requires_staff" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"bio" text,
	"avatar" text,
	"email" text,
	"phone" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"kind" text DEFAULT 'person' NOT NULL,
	"accepts_online_booking" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"price_override" bigint,
	"duration_override_min" integer,
	CONSTRAINT "staff_services_staff_id_service_id_pk" PRIMARY KEY("staff_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "booking_waitlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"staff_id" uuid,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"preferred_date" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_stock" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"code_encrypted" text NOT NULL,
	"serial" text,
	"status" text DEFAULT 'available' NOT NULL,
	"sold_order_id" uuid,
	"expires_at" timestamp with time zone,
	"added_by" text,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"price" bigint NOT NULL,
	"cost_price" bigint,
	"tier_prices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fulfillment" text DEFAULT 'manual' NOT NULL,
	"supplier_id" uuid,
	"supplier_product_code" text,
	"estimated_minutes" integer DEFAULT 5 NOT NULL,
	"badge" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"publisher" text,
	"description" text,
	"image" text,
	"banner" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" text,
	"category" text DEFAULT 'mobile' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_blacklist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"game_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"game_name" text NOT NULL,
	"package_name" text NOT NULL,
	"player_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"price" bigint NOT NULL,
	"cost_price" bigint,
	"payment_method" text NOT NULL,
	"payment_id" uuid,
	"fulfillment" text NOT NULL,
	"supplier_id" uuid,
	"supplier_ref" text,
	"supplier_response" jsonb,
	"delivered_code_encrypted" text,
	"failure_reason" text,
	"processed_by" text,
	"proof_image" text,
	"contact" text,
	"ip" text,
	"device_id" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_flags" text[] DEFAULT '{}' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"balance" bigint,
	"balance_updated_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_topups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"bonus" bigint DEFAULT 0 NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"idempotency_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"zone" text,
	"seats" integer DEFAULT 4 NOT NULL,
	"qr_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"description" text,
	"image" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifier_groups" (
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_modifier_groups_item_id_group_id_pk" PRIMARY KEY("item_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"description" text,
	"image" text,
	"price" bigint NOT NULL,
	"compare_at_price" bigint,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"spicy_level" smallint DEFAULT 0 NOT NULL,
	"prep_minutes" integer,
	"station" text DEFAULT 'kitchen' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta" bigint DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"party_size" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"zone" text,
	"table_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"payment_id" uuid,
	"note" text,
	"occasion" text,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" bigint NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" bigint NOT NULL,
	"note" text,
	"station" text DEFAULT 'kitchen' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"table_id" uuid,
	"session_id" uuid,
	"customer_id" uuid,
	"customer_name" text,
	"customer_phone" text,
	"guest_label" text,
	"status" text DEFAULT 'received' NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount_total" bigint DEFAULT 0 NOT NULL,
	"service_charge" bigint DEFAULT 0 NOT NULL,
	"delivery_fee" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_id" uuid,
	"scheduled_for" timestamp with time zone,
	"delivery_address" jsonb,
	"note" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"guest_count" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"total" bigint DEFAULT 0 NOT NULL,
	"payment_id" uuid
);
--> statement-breakpoint
CREATE TABLE "clinic_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"service_id" uuid,
	"sessions" integer NOT NULL,
	"price" bigint NOT NULL,
	"compare_at_price" bigint,
	"validity_days" integer DEFAULT 365 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"booking_id" uuid,
	"doctor_id" uuid,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"chief_complaint" text,
	"vitals" jsonb,
	"notes_encrypted" text,
	"diagnosis" text,
	"procedures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prescriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos_before" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos_after" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_id" uuid,
	"next_visit_note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_usages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_package_id" uuid NOT NULL,
	"visit_id" uuid,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_staff_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "patient_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"sessions_total" integer NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"price_paid" bigint NOT NULL,
	"payment_id" uuid,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hn" text NOT NULL,
	"customer_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text,
	"nickname" text,
	"gender" text,
	"birth_date" text,
	"national_id_encrypted" text,
	"national_id_hint" text,
	"phone" text,
	"email" text,
	"line_user_id" text,
	"address" jsonb,
	"blood_type" text,
	"allergies" text,
	"chronic_conditions" text,
	"current_medications" text,
	"emergency_contact" jsonb,
	"avatar" text,
	"notes" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"consents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_access_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation" ADD CONSTRAINT "navigation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_waitlist" ADD CONSTRAINT "booking_waitlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_stock" ADD CONSTRAINT "code_stock_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_stock" ADD CONSTRAINT "code_stock_package_id_game_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."game_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_packages" ADD CONSTRAINT "game_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_packages" ADD CONSTRAINT "game_packages_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_packages" ADD CONSTRAINT "game_packages_supplier_id_topup_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."topup_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_blacklist" ADD CONSTRAINT "topup_blacklist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_package_id_game_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."game_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_suppliers" ADD CONSTRAINT "topup_suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_order_id_restaurant_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_packages" ADD CONSTRAINT "clinic_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_packages" ADD CONSTRAINT "clinic_packages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_doctor_id_staff_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_usages" ADD CONSTRAINT "package_usages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_usages" ADD CONSTRAINT "package_usages_patient_package_id_patient_packages_id_fk" FOREIGN KEY ("patient_package_id") REFERENCES "public"."patient_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_usages" ADD CONSTRAINT "package_usages_visit_id_clinic_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."clinic_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_package_id_clinic_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."clinic_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_access_logs" ADD CONSTRAINT "record_access_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "events_outbox_status_next_idx" ON "events_outbox" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_hostname_uq" ON "tenant_domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_invitations_token_uq" ON "tenant_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_members_tenant_user_uq" ON "tenant_members" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "tenant_members_user_idx" ON "tenant_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_uq" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_tenant_idx" ON "webhook_endpoints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("tenant_id","form_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forms_tenant_slug_uq" ON "forms" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "media_tenant_folder_idx" ON "media" USING btree ("tenant_id","folder","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_tenant_location_uq" ON "navigation" USING btree ("tenant_id","location");--> statement-breakpoint
CREATE INDEX "page_versions_page_idx" ON "page_versions" USING btree ("tenant_id","page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_tenant_slug_uq" ON "pages" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_tenant_slug_uq" ON "posts" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "customer_otps_target_idx" ON "customer_otps" USING btree ("tenant_id","target","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_token_uq" ON "customer_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_email_uq" ON "customers" USING btree ("tenant_id","email") WHERE "customers"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_phone_uq" ON "customers" USING btree ("tenant_id","phone") WHERE "customers"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_line_uq" ON "customers" USING btree ("tenant_id","line_user_id") WHERE "customers"."line_user_id" is not null;--> statement-breakpoint
CREATE INDEX "customers_tenant_created_idx" ON "customers" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_customer_idx" ON "loyalty_transactions" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("tenant_id","cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_token_uq" ON "carts" USING btree ("token");--> statement-breakpoint
CREATE INDEX "carts_tenant_customer_idx" ON "carts" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_slug_uq" ON "categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_tenant_code_uq" ON "discounts" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_idx" ON "inventory_movements" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_number_uq" ON "orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "orders_tenant_placed_idx" ON "orders" USING btree ("tenant_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_idx" ON "orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "orders_tenant_customer_idx" ON "orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "payments_ref_idx" ON "payments" USING btree ("tenant_id","ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_status_idx" ON "payments" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_slip_trans_ref_uq" ON "payments" USING btree ("tenant_id","slip_trans_ref") WHERE "payments"."slip_trans_ref" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_uq" ON "product_variants" USING btree ("tenant_id","sku") WHERE "product_variants"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_slug_uq" ON "products" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "products_tenant_status_idx" ON "products" USING btree ("tenant_id","status","sort");--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("tenant_id","product_id","status");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "shipping_methods_tenant_idx" ON "shipping_methods" USING btree ("tenant_id","sort");--> statement-breakpoint
CREATE INDEX "availability_overrides_range_idx" ON "availability_overrides" USING btree ("tenant_id","staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "availability_rules_staff_idx" ON "availability_rules" USING btree ("tenant_id","staff_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_tenant_number_uq" ON "bookings" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "bookings_staff_time_idx" ON "bookings" USING btree ("tenant_id","staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_tenant_time_idx" ON "bookings" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_tenant_slug_uq" ON "service_categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "services_tenant_slug_uq" ON "services" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_tenant_slug_uq" ON "staff" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "waitlist_tenant_date_idx" ON "booking_waitlist" USING btree ("tenant_id","preferred_date");--> statement-breakpoint
CREATE INDEX "code_stock_package_status_idx" ON "code_stock" USING btree ("tenant_id","package_id","status");--> statement-breakpoint
CREATE INDEX "game_packages_game_idx" ON "game_packages" USING btree ("tenant_id","game_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "games_tenant_slug_uq" ON "games" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "topup_blacklist_uq" ON "topup_blacklist" USING btree ("tenant_id","kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "topup_orders_tenant_number_uq" ON "topup_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "topup_orders_tenant_status_idx" ON "topup_orders" USING btree ("tenant_id","status","placed_at");--> statement-breakpoint
CREATE INDEX "topup_orders_customer_idx" ON "topup_orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "topup_suppliers_tenant_idx" ON "topup_suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wallet_topups_wallet_idx" ON "wallet_topups" USING btree ("tenant_id","wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_tx_wallet_idx" ON "wallet_transactions" USING btree ("tenant_id","wallet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_tx_idem_uq" ON "wallet_transactions" USING btree ("tenant_id","idempotency_key") WHERE "wallet_transactions"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_customer_uq" ON "wallets" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_qr_uq" ON "dining_tables" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_name_uq" ON "dining_tables" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "menu_categories_menu_idx" ON "menu_categories" USING btree ("tenant_id","menu_id","sort");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("tenant_id","category_id","sort");--> statement-breakpoint
CREATE INDEX "menus_tenant_idx" ON "menus" USING btree ("tenant_id","sort");--> statement-breakpoint
CREATE INDEX "modifier_groups_tenant_idx" ON "modifier_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "modifiers_group_idx" ON "modifiers" USING btree ("tenant_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_number_uq" ON "reservations" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "reservations_time_idx" ON "reservations" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "restaurant_order_items_order_idx" ON "restaurant_order_items" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_orders_number_uq" ON "restaurant_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "restaurant_orders_status_idx" ON "restaurant_orders" USING btree ("tenant_id","status","placed_at");--> statement-breakpoint
CREATE INDEX "restaurant_orders_session_idx" ON "restaurant_orders" USING btree ("tenant_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_token_uq" ON "table_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "table_sessions_table_idx" ON "table_sessions" USING btree ("tenant_id","table_id","status");--> statement-breakpoint
CREATE INDEX "clinic_packages_tenant_idx" ON "clinic_packages" USING btree ("tenant_id","sort");--> statement-breakpoint
CREATE INDEX "clinic_visits_patient_idx" ON "clinic_visits" USING btree ("tenant_id","patient_id","visited_at");--> statement-breakpoint
CREATE INDEX "package_usages_pkg_idx" ON "package_usages" USING btree ("tenant_id","patient_package_id");--> statement-breakpoint
CREATE INDEX "patient_packages_patient_idx" ON "patient_packages" USING btree ("tenant_id","patient_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_tenant_hn_uq" ON "patients" USING btree ("tenant_id","hn");--> statement-breakpoint
CREATE INDEX "patients_tenant_phone_idx" ON "patients" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "patients_tenant_name_idx" ON "patients" USING btree ("tenant_id","first_name","last_name");--> statement-breakpoint
CREATE INDEX "record_access_logs_patient_idx" ON "record_access_logs" USING btree ("tenant_id","patient_id","created_at");