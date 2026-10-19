import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers } from "./customers";

export type GameField = {
  key: string; // uid, server, zone
  label: string;
  type: "text" | "number" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
  helpImage?: string;
  /**
   * Optional format rule (STOREFRONT-12), checked server-side by validatePlayerFields and mirrored as the input's
   * `pattern` attribute: a JavaScript regex source matched against the WHOLE trimmed value (anchors implied),
   * e.g. "\\d{9,10}" (Genshin UID) or "[^#\\s][^#]{2,15}#[A-Za-z0-9]{3,5}" (Riot ID Name#TAG).
   */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  /** "numeric" → numeric keypad (inputMode) without turning the value into a number (keeps leading zeros) */
  inputMode?: "text" | "numeric";
  /** Thai format hint shown under the field and used as the error message, e.g. "ตัวเลข 9–10 หลัก" */
  hint?: string;
};

export const games = pgTable(
  "games",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    publisher: text("publisher"),
    description: text("description"),
    image: text("image"), // square icon
    banner: text("banner"),
    fields: jsonb("fields").$type<GameField[]>().notNull().default([]),
    instructions: text("instructions"), // how to find UID etc.
    category: text("category").notNull().default("mobile"), // mobile | pc | console | voucher | app
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("games_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const topupSuppliers = pgTable(
  "topup_suppliers",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    provider: text("provider").notNull(), // adapter key: generic_http | manual | …
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}), // non-secret config; secrets in tenant_secrets
    balance: money("balance"),
    balanceUpdatedAt: tz("balance_updated_at"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("topup_suppliers_tenant_idx").on(t.tenantId)],
);

export const gamePackages = pgTable(
  "game_packages",
  {
    id: id(),
    tenantId: tenantRef(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "86 Diamonds"
    description: text("description"),
    image: text("image"),
    price: money("price").notNull(),
    costPrice: money("cost_price"),
    /** per-tier price overrides: { vip: 3300, agent: 3200 } */
    tierPrices: jsonb("tier_prices").$type<Record<string, number>>().notNull().default({}),
    fulfillment: text("fulfillment").notNull().default("manual"), // api | stock | manual
    supplierId: uuid("supplier_id").references(() => topupSuppliers.id, { onDelete: "set null" }),
    supplierProductCode: text("supplier_product_code"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(5),
    badge: text("badge"), // "ขายดี", "คุ้มสุด"
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("game_packages_game_idx").on(t.tenantId, t.gameId, t.sort)],
);

export const codeStock = pgTable(
  "code_stock",
  {
    id: id(),
    tenantId: tenantRef(),
    // RESTRICT (ADMIN-07): deleting a package must never silently destroy unsold codes – the admin voids / moves them first
    packageId: uuid("package_id")
      .notNull()
      .references(() => gamePackages.id, { onDelete: "restrict" }),
    codeEncrypted: text("code_encrypted").notNull(),
    /**
     * ADMIN-06: keyed HMAC-SHA256 of the normalised plaintext (stockCodeHash in the module's admin/catalog.ts), unique per
     * tenant across every status, so the same code can never be imported twice (again, into another package, or after
     * it was sold). NULL only for rows written before 0010 until the import backfills them.
     */
    codeHash: text("code_hash"),
    serial: text("serial"),
    status: text("status").notNull().default("available"), // available | reserved | sold | void
    soldOrderId: uuid("sold_order_id"),
    expiresAt: tz("expires_at"),
    addedBy: text("added_by"),
    soldAt: tz("sold_at"),
    createdAt: createdAt(),
  },
  (t) => [index("code_stock_package_status_idx").on(t.tenantId, t.packageId, t.status), uniqueIndex("code_stock_tenant_hash_uq").on(t.tenantId, t.codeHash)],
);

export const wallets = pgTable(
  "wallets",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    balance: money("balance").notNull().default(0), // cached; source of truth = wallet_transactions
    currency: text("currency").notNull().default("THB"),
    frozen: boolean("frozen").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("wallets_customer_uq").on(t.tenantId, t.customerId)],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: id(),
    tenantId: tenantRef(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // credit | debit
    amount: money("amount").notNull(), // always positive
    balanceAfter: money("balance_after").notNull(),
    reason: text("reason").notNull(), // topup | purchase | refund | adjustment | bonus
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("wallet_tx_wallet_idx").on(t.tenantId, t.walletId, t.createdAt),
    uniqueIndex("wallet_tx_idem_uq")
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const walletTopups = pgTable(
  "wallet_topups",
  {
    id: id(),
    tenantId: tenantRef(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    bonus: money("bonus").notNull().default(0),
    method: text("method").notNull(), // promptpay | slip | card | truemoney_voucher
    status: text("status").notNull().default("pending"), // pending | pending_verification | credited | rejected (money could not be credited → refund flag) | expired | cancelled
    paymentId: uuid("payment_id"),
    creditedAt: tz("credited_at"),
    ...timestamps(),
  },
  (t) => [index("wallet_topups_wallet_idx").on(t.tenantId, t.walletId, t.createdAt)],
);

export const topupOrders = pgTable(
  "topup_orders",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => gamePackages.id, { onDelete: "restrict" }),
    gameName: text("game_name").notNull(),
    packageName: text("package_name").notNull(),
    playerFields: jsonb("player_fields").$type<Record<string, string>>().notNull().default({}),
    status: text("status").notNull().default("pending_payment"), // pending_payment | paid | processing | fulfilled | failed | refunded | cancelled
    price: money("price").notNull(),
    costPrice: money("cost_price"),
    paymentMethod: text("payment_method").notNull(), // wallet | promptpay | slip | card
    paymentId: uuid("payment_id"),
    fulfillment: text("fulfillment").notNull(), // api | stock | manual
    supplierId: uuid("supplier_id"),
    supplierRef: text("supplier_ref"),
    supplierResponse: jsonb("supplier_response").$type<Record<string, unknown>>(),
    deliveredCodeEncrypted: text("delivered_code_encrypted"),
    failureReason: text("failure_reason"),
    processedBy: text("processed_by"),
    proofImage: text("proof_image"),
    contact: text("contact"), // phone / line id for delivery notification
    ip: text("ip"),
    deviceId: text("device_id"),
    riskScore: integer("risk_score").notNull().default(0),
    riskFlags: text("risk_flags").array().notNull().default([]),
    placedAt: tz("placed_at").notNull().defaultNow(),
    paidAt: tz("paid_at"),
    fulfilledAt: tz("fulfilled_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("topup_orders_tenant_number_uq").on(t.tenantId, t.number),
    index("topup_orders_tenant_status_idx").on(t.tenantId, t.status, t.placedAt),
    index("topup_orders_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const topupBlacklist = pgTable(
  "topup_blacklist",
  {
    id: id(),
    tenantId: tenantRef(),
    kind: text("kind").notNull(), // phone | ip | uid | email | device
    value: text("value").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("topup_blacklist_uq").on(t.tenantId, t.kind, t.value)],
);
