import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, money, timestamps, tz } from "./_helpers";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const tenantStatus = pgEnum("tenant_status", [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "deleted",
]);

export const domainKind = pgEnum("domain_kind", ["subdomain", "custom"]);
export const domainStatus = pgEnum("domain_status", ["pending", "verifying", "active", "failed"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "manager", "staff", "viewer"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "unpaid",
]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "processing", "done", "failed"]);

/* ------------------------------------------------------------------ */
/* Tenants                                                             */
/* ------------------------------------------------------------------ */

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    siteType: text("site_type").notNull(), // template key used at provisioning
    planKey: text("plan_key").notNull().default("trial"),
    status: tenantStatus("status").notNull().default("trialing"),
    locale: text("locale").notNull().default("th"),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    currency: text("currency").notNull().default("THB"),
    /** Tenant-wide settings (contact info, business hours, legal, seo defaults, payments…) */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    /** Theme tokens – see @rentweb/core theme schema */
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    onboarding: jsonb("onboarding").$type<Record<string, unknown>>().notNull().default({}),
    trialEndsAt: tz("trial_ends_at"),
    suspendedAt: tz("suspended_at"),
    deletedAt: tz("deleted_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug), index("tenants_status_idx").on(t.status)],
);

/** Reference helper: every tenant-owned table uses this column. */
export const tenantRef = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: id(),
    tenantId: tenantRef(),
    hostname: text("hostname").notNull(),
    kind: domainKind("kind").notNull().default("custom"),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: domainStatus("status").notNull().default("pending"),
    verificationToken: text("verification_token"),
    sslStatus: text("ssl_status"),
    lastCheckedAt: tz("last_checked_at"),
    verifiedAt: tz("verified_at"),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (t) => [
    // ADMIN_B2-11: only a verified (active) domain is unique platform-wide; several tenants may hold
    // pending claims for the same hostname and whoever proves DNS ownership first wins.
    uniqueIndex("tenant_domains_active_hostname_uq").on(t.hostname).where(sql`${t.status} = 'active'`),
    uniqueIndex("tenant_domains_tenant_host_uq").on(t.tenantId, t.hostname),
    index("tenant_domains_hostname_idx").on(t.hostname),
    index("tenant_domains_tenant_idx").on(t.tenantId),
  ],
);

export const tenantModules = pgTable(
  "tenant_modules",
  {
    tenantId: tenantRef(),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    enabledAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.moduleKey] })],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: id(),
    tenantId: tenantRef(),
    userId: text("user_id").notNull(),
    role: memberRole("role").notNull().default("staff"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    invitedBy: text("invited_by"),
    joinedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tenant_members_tenant_user_uq").on(t.tenantId, t.userId),
    index("tenant_members_user_idx").on(t.userId),
  ],
);

export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: id(),
    tenantId: tenantRef(),
    email: text("email").notNull(),
    role: memberRole("role").notNull().default("staff"),
    token: text("token").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: tz("expires_at").notNull(),
    acceptedAt: tz("accepted_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("tenant_invitations_token_uq").on(t.token)],
);

/** Encrypted per-tenant secrets (payment gateway keys, LINE channel secret…). */
export const tenantSecrets = pgTable(
  "tenant_secrets",
  {
    tenantId: tenantRef(),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    hint: text("hint"), // last 4 chars for display
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

/** Per-tenant monotonically increasing counters (order numbers, HN…). */
export const tenantCounters = pgTable(
  "tenant_counters",
  {
    tenantId: tenantRef(),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const tenantUsage = pgTable(
  "tenant_usage",
  {
    tenantId: tenantRef(),
    metric: text("metric").notNull(), // storage_bytes, products, orders_month, sms_month…
    period: text("period").notNull(), // 'current' or 'YYYY-MM'
    value: integer("value").notNull().default(0),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.metric, t.period] })],
);

/* ------------------------------------------------------------------ */
/* Plans, billing, templates                                           */
/* ------------------------------------------------------------------ */

export const plans = pgTable("plans", {
  key: text("key").primaryKey(), // trial, starter, pro, business, enterprise
  name: text("name").notNull(),
  description: text("description"),
  priceMonthly: money("price_monthly").notNull().default(0),
  priceYearly: money("price_yearly").notNull().default(0),
  limits: jsonb("limits").$type<Record<string, number>>().notNull().default({}),
  modulesAllowed: text("modules_allowed").array().notNull().default([]),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    tenantId: tenantRef(),
    planKey: text("plan_key").notNull(),
    provider: text("provider").notNull().default("manual"), // stripe | opn | manual
    providerSubId: text("provider_sub_id"),
    status: subscriptionStatus("status").notNull().default("trialing"),
    interval: text("interval").notNull().default("month"), // month | year
    currentPeriodStart: tz("current_period_start"),
    currentPeriodEnd: tz("current_period_end"),
    cancelAt: tz("cancel_at"),
    ...timestamps(),
  },
  (t) => [index("subscriptions_tenant_idx").on(t.tenantId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(),
    amount: money("amount").notNull(),
    vat: money("vat").notNull().default(0),
    total: money("total").notNull(),
    currency: text("currency").notNull().default("THB"),
    status: text("status").notNull().default("open"), // open | paid | void | uncollectible
    provider: text("provider"),
    providerRef: text("provider_ref"),
    pdfUrl: text("pdf_url"),
    dueAt: tz("due_at"),
    paidAt: tz("paid_at"),
    lines: jsonb("lines").$type<Array<{ description: string; amount: number }>>().notNull().default([]),
    ...timestamps(),
  },
  (t) => [uniqueIndex("invoices_number_uq").on(t.number), index("invoices_tenant_idx").on(t.tenantId)],
);

export const templates = pgTable("templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // commerce | booking | hospitality | digital | content | …
  siteType: text("site_type").notNull(),
  modules: text("modules").array().notNull().default([]),
  themePreset: text("theme_preset").notNull(),
  previewImage: text("preview_image"),
  demoTenantSlug: text("demo_tenant_slug"),
  complexity: integer("complexity").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
});

/* ------------------------------------------------------------------ */
/* Cross-cutting: audit, outbox, notifications, webhooks, idempotency  */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    tenantId: uuid("tenant_id"), // nullable: platform-level actions
    actorType: text("actor_type").notNull(), // user | customer | system | superadmin
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const eventsOutbox = pgTable(
  "events_outbox",
  {
    id: id(),
    tenantId: uuid("tenant_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: tz("next_run_at").notNull().defaultNow(),
    lastError: text("last_error"),
    processedAt: tz("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("events_outbox_status_next_idx").on(t.status, t.nextRunAt)],
);

/**
 * Cross-process cache invalidation log (ADMIN_B2-19). When no shared cache (Upstash) is configured every
 * app process keeps its own in-memory cache; `del()` appends the keys here and the other processes poll
 * the log every couple of seconds and evict them. Rows older than an hour are pruned.
 */
export const cacheInvalidations = pgTable(
  "cache_invalidations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    keys: text("keys").array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("cache_invalidations_created_idx").on(t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: uuid("tenant_id"),
    channel: text("channel").notNull(), // email | line | sms | push | inapp
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("queued"), // queued | sent | failed
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: tz("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    tenantId: tenantRef(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: text("events").array().notNull().default([]),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("webhook_endpoints_tenant_idx").on(t.tenantId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    tenantId: tenantRef(),
    key: text("key").notNull(),
    responseHash: text("response_hash"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
