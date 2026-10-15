import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";

/** End customers of each tenant's storefront (buyers, patients, players…). Scoped per tenant. */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantRef(),
    email: text("email"),
    phone: text("phone"),
    lineUserId: text("line_user_id"),
    name: text("name"),
    avatar: text("avatar"),
    passwordHash: text("password_hash"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    tier: text("tier").notNull().default("member"), // member | vip | agent … (used by top-up pricing)
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    consentAt: tz("consent_at"),
    consentRecord: jsonb("consent_record").$type<Record<string, unknown>>(),
    totalSpent: integer("total_spent").notNull().default(0),
    ordersCount: integer("orders_count").notNull().default(0),
    lastSeenAt: tz("last_seen_at"),
    blockedAt: tz("blocked_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("customers_tenant_email_uq")
      .on(t.tenantId, t.email)
      .where(sql`${t.email} is not null`),
    uniqueIndex("customers_tenant_phone_uq")
      .on(t.tenantId, t.phone)
      .where(sql`${t.phone} is not null`),
    uniqueIndex("customers_tenant_line_uq")
      .on(t.tenantId, t.lineUserId)
      .where(sql`${t.lineUserId} is not null`),
    index("customers_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export type AddressJson = {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  note?: string;
};

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    address: jsonb("address").$type<AddressJson>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.tenantId, t.customerId)],
);

export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: tz("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_sessions_token_uq").on(t.tokenHash)],
);

export const customerOtps = pgTable(
  "customer_otps",
  {
    id: id(),
    tenantId: tenantRef(),
    target: text("target").notNull(), // phone or email
    channel: text("channel").notNull(), // sms | email | line
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: tz("expires_at").notNull(),
    consumedAt: tz("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("customer_otps_target_idx").on(t.tenantId, t.target, t.createdAt)],
);

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    points: integer("points").notNull(), // positive earn, negative redeem
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("loyalty_customer_idx").on(t.tenantId, t.customerId, t.createdAt)],
);
