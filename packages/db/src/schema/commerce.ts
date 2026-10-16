import { boolean, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers, type AddressJson } from "./customers";

export type ProductImage = { url: string; alt?: string; mediaId?: string };
export type ProductOption = { name: string; values: string[] };

export const categories = pgTable(
  "categories",
  {
    id: id(),
    tenantId: tenantRef(),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    image: text("image"),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("categories_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"), // HTML (sanitized) or plain
    shortDescription: text("short_description"),
    status: text("status").notNull().default("draft"), // draft | active | archived
    type: text("type").notNull().default("physical"), // physical | digital | service | preorder
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    images: jsonb("images").$type<ProductImage[]>().notNull().default([]),
    price: money("price").notNull().default(0),
    compareAtPrice: money("compare_at_price"),
    costPrice: money("cost_price"),
    currency: text("currency").notNull().default("THB"),
    hasVariants: boolean("has_variants").notNull().default(false),
    options: jsonb("options").$type<ProductOption[]>().notNull().default([]),
    trackInventory: boolean("track_inventory").notNull().default(true),
    stock: integer("stock").notNull().default(0), // used when hasVariants = false
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    weightGrams: integer("weight_grams").notNull().default(0),
    sku: text("sku"),
    barcode: text("barcode"),
    tags: text("tags").array().notNull().default([]),
    featured: boolean("featured").notNull().default(false),
    digitalAsset: jsonb("digital_asset").$type<{ mediaId?: string; url?: string; note?: string }>(),
    seo: jsonb("seo").$type<Record<string, unknown>>().notNull().default({}),
    ratingAvg: integer("rating_avg").notNull().default(0), // x100
    ratingCount: integer("rating_count").notNull().default(0),
    soldCount: integer("sold_count").notNull().default(0),
    sort: integer("sort").notNull().default(0),
    publishedAt: tz("published_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("products_tenant_slug_uq").on(t.tenantId, t.slug),
    index("products_tenant_status_idx").on(t.tenantId, t.status, t.sort),
    index("products_tenant_category_idx").on(t.tenantId, t.categoryId),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    tenantId: tenantRef(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(), // "แดง / L"
    optionValues: jsonb("option_values").$type<Record<string, string>>().notNull().default({}),
    sku: text("sku"),
    barcode: text("barcode"),
    price: money("price").notNull(),
    compareAtPrice: money("compare_at_price"),
    costPrice: money("cost_price"),
    stock: integer("stock").notNull().default(0),
    image: text("image"),
    weightGrams: integer("weight_grams"),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index("product_variants_product_idx").on(t.tenantId, t.productId),
    uniqueIndex("product_variants_sku_uq")
      .on(t.tenantId, t.sku)
      .where(sql`${t.sku} is not null`),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    tenantId: tenantRef(),
    productId: uuid("product_id").notNull(),
    variantId: uuid("variant_id"),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // sale | restock | adjustment | return | reservation | release
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("inventory_movements_product_idx").on(t.tenantId, t.productId, t.createdAt)],
);

export const carts = pgTable(
  "carts",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    token: text("token").notNull(),
    status: text("status").notNull().default("active"), // active | converted | abandoned | merged
    /** set when status = merged: the customer cart this cart was merged into (SS-12, cart follows the account) */
    mergedIntoId: uuid("merged_into_id"),
    couponCode: text("coupon_code"),
    note: text("note"),
    expiresAt: tz("expires_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("carts_token_uq").on(t.token), index("carts_tenant_customer_idx").on(t.tenantId, t.customerId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    tenantId: tenantRef(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    index("cart_items_cart_idx").on(t.tenantId, t.cartId),
    // one line per product/variant per cart (COR-04: parallel add-to-cart must merge, not duplicate)
    unique("cart_items_line_uq").on(t.cartId, t.productId, t.variantId).nullsNotDistinct(),
  ],
);

export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("flat"), // flat | weight | free_over | pickup | cod
    /** flat: {amount}; weight: {tiers:[{maxGrams, amount}]}; free_over: {amount, threshold}; cod: {amount, fee} */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    estimatedDays: text("estimated_days"),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("shipping_methods_tenant_idx").on(t.tenantId, t.sort)],
);

export const discounts = pgTable(
  "discounts",
  {
    id: id(),
    tenantId: tenantRef(),
    code: text("code").notNull(),
    name: text("name"),
    type: text("type").notNull(), // percent | fixed | free_shipping
    value: integer("value").notNull().default(0), // percent (0-100) or satang
    minSubtotal: money("min_subtotal").notNull().default(0),
    maxDiscount: money("max_discount"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit"),
    appliesTo: jsonb("applies_to").$type<{ productIds?: string[]; categoryIds?: string[] }>(),
    startsAt: tz("starts_at"),
    endsAt: tz("ends_at"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("discounts_tenant_code_uq").on(t.tenantId, t.code)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(), // e.g. #1001 (per tenant)
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    email: text("email"),
    phone: text("phone"),
    customerName: text("customer_name"),
    status: text("status").notNull().default("pending"), // pending | confirmed | processing | shipped | completed | cancelled | refunded
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | pending_verification | paid | partially_refunded | refunded | failed
    fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"), // unfulfilled | partial | fulfilled | pickup_ready | picked_up
    subtotal: money("subtotal").notNull().default(0),
    discountTotal: money("discount_total").notNull().default(0),
    shippingTotal: money("shipping_total").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull().default(0),
    currency: text("currency").notNull().default("THB"),
    couponCode: text("coupon_code"),
    shippingMethodName: text("shipping_method_name"),
    shippingMethodType: text("shipping_method_type"),
    shippingAddress: jsonb("shipping_address").$type<AddressJson>(),
    billingAddress: jsonb("billing_address").$type<AddressJson>(),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    tags: text("tags").array().notNull().default([]),
    source: text("source").notNull().default("storefront"), // storefront | admin | line | pos
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    placedAt: tz("placed_at").notNull().defaultNow(),
    paidAt: tz("paid_at"),
    shippedAt: tz("shipped_at"),
    completedAt: tz("completed_at"),
    cancelledAt: tz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("orders_tenant_number_uq").on(t.tenantId, t.number),
    index("orders_tenant_placed_idx").on(t.tenantId, t.placedAt),
    index("orders_tenant_status_idx").on(t.tenantId, t.status),
    index("orders_tenant_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    tenantId: tenantRef(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id"),
    variantId: uuid("variant_id"),
    name: text("name").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    image: text("image"),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    total: money("total").notNull(),
    type: text("type").notNull().default("physical"),
    digitalDelivery: jsonb("digital_delivery").$type<{ url?: string; code?: string; deliveredAt?: string }>(),
    fulfilledQuantity: integer("fulfilled_quantity").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("order_items_order_idx").on(t.tenantId, t.orderId)],
);

/** Shared payments table used by all modules (orders, bookings, top-ups, reservations, invoices). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantRef(),
    refType: text("ref_type").notNull(), // order | booking | topup | wallet_topup | rest_order | reservation | patient_package
    refId: uuid("ref_id").notNull(),
    customerId: uuid("customer_id"),
    provider: text("provider").notNull(), // bank_transfer | promptpay | opn | gbprimepay | stripe | cod | wallet | cash
    method: text("method").notNull(), // slip | promptpay_qr | card | cod | wallet | cash | installment
    status: text("status").notNull().default("pending"), // pending | pending_verification | paid | failed | refunded | partially_refunded | cancelled | expired
    amount: money("amount").notNull(),
    refundedAmount: money("refunded_amount").notNull().default(0),
    currency: text("currency").notNull().default("THB"),
    providerRef: text("provider_ref"), // charge id
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    qrPayload: text("qr_payload"),
    slipUrl: text("slip_url"),
    slipVerification: jsonb("slip_verification").$type<Record<string, unknown>>(),
    slipTransRef: text("slip_trans_ref"), // bank transaction ref, used to block duplicate slips
    expiresAt: tz("expires_at"),
    paidAt: tz("paid_at"),
    verifiedBy: text("verified_by"),
    failureReason: text("failure_reason"),
    ...timestamps(),
  },
  (t) => [
    index("payments_ref_idx").on(t.tenantId, t.refType, t.refId),
    index("payments_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    // cross-tenant expiry sweep (expireStalePayments: status = pending and expires_at due)
    index("payments_status_expires_idx").on(t.status, t.expiresAt).where(sql`${t.expiresAt} is not null`),
    uniqueIndex("payments_slip_trans_ref_uq")
      .on(t.tenantId, t.slipTransRef)
      .where(sql`${t.slipTransRef} is not null`),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    tenantId: tenantRef(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    carrier: text("carrier").notNull(), // flash | kerry | jnt | thaipost | other | pickup
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    status: text("status").notNull().default("pending"), // pending | shipped | in_transit | delivered | returned
    items: jsonb("items").$type<Array<{ orderItemId: string; quantity: number }>>().notNull().default([]),
    shippedAt: tz("shipped_at"),
    deliveredAt: tz("delivered_at"),
    ...timestamps(),
  },
  (t) => [index("shipments_order_idx").on(t.tenantId, t.orderId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    tenantId: tenantRef(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id"),
    orderId: uuid("order_id"),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    body: text("body"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    reply: text("reply"),
    repliedAt: tz("replied_at"),
    ...timestamps(),
  },
  (t) => [index("reviews_product_idx").on(t.tenantId, t.productId, t.status)],
);
