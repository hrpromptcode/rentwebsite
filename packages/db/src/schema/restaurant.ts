import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers, type AddressJson } from "./customers";

export const menus = pgTable(
  "menus",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(), // "เมนูหลัก", "เมนูเช้า"
    /** availability schedule: [{weekday:[1,2,3], start:"06:00", end:"11:00"}] – empty = always */
    schedule: jsonb("schedule").$type<Array<{ weekdays: number[]; start: string; end: string }>>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("menus_tenant_idx").on(t.tenantId, t.sort)],
);

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: id(),
    tenantId: tenantRef(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    image: text("image"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("menu_categories_menu_idx").on(t.tenantId, t.menuId, t.sort)],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(), // "ระดับความเผ็ด", "ท็อปปิ้ง"
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select").notNull().default(1),
    required: boolean("required").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("modifier_groups_tenant_idx").on(t.tenantId)],
);

export const modifiers = pgTable(
  "modifiers",
  {
    id: id(),
    tenantId: tenantRef(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceDelta: money("price_delta").notNull().default(0),
    available: boolean("available").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("modifiers_group_idx").on(t.tenantId, t.groupId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    tenantId: tenantRef(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    image: text("image"),
    price: money("price").notNull(),
    compareAtPrice: money("compare_at_price"),
    tags: text("tags").array().notNull().default([]), // recommended, new, spicy, vegan
    allergens: text("allergens").array().notNull().default([]),
    spicyLevel: smallint("spicy_level").notNull().default(0),
    prepMinutes: integer("prep_minutes"),
    station: text("station").notNull().default("kitchen"), // kitchen | bar | dessert
    available: boolean("available").notNull().default(true),
    soldOut: boolean("sold_out").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("menu_items_category_idx").on(t.tenantId, t.categoryId, t.sort)],
);

export const menuItemModifierGroups = pgTable(
  "menu_item_modifier_groups",
  {
    tenantId: tenantRef(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.groupId] })],
);

export const diningTables = pgTable(
  "dining_tables",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(), // "A1"
    zone: text("zone"),
    seats: integer("seats").notNull().default(4),
    qrToken: text("qr_token").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("dining_tables_qr_uq").on(t.qrToken), uniqueIndex("dining_tables_name_uq").on(t.tenantId, t.name)],
);

/** A seating session: opened when first guest scans QR, closed when bill is paid. */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: id(),
    tenantId: tenantRef(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id, { onDelete: "cascade" }),
    token: text("token").notNull(), // short code shared by guests at the table
    status: text("status").notNull().default("open"), // open | bill_requested | paid | expired (retired by the system with money due) | closed
    guestCount: integer("guest_count"),
    openedAt: tz("opened_at").notNull().defaultNow(),
    closedAt: tz("closed_at"),
    total: money("total").notNull().default(0),
    paymentId: uuid("payment_id"),
  },
  (t) => [
    uniqueIndex("table_sessions_token_uq").on(t.token),
    index("table_sessions_table_idx").on(t.tenantId, t.tableId, t.status),
    // one session guests can order into per table (COR-26: parallel QR scans must join, not fork, the table)
    uniqueIndex("table_sessions_open_table_uq").on(t.tenantId, t.tableId).where(sql`${t.status} in ('open', 'bill_requested')`),
  ],
);

export const restaurantOrders = pgTable(
  "restaurant_orders",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(),
    type: text("type").notNull(), // dine_in | pickup | delivery
    tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    guestLabel: text("guest_label"), // name typed at the table ("โต๊ะ 5 - คุณเอ")
    status: text("status").notNull().default("received"), // received | preparing | ready | served | completed | cancelled
    subtotal: money("subtotal").notNull().default(0),
    discountTotal: money("discount_total").notNull().default(0),
    serviceCharge: money("service_charge").notNull().default(0),
    deliveryFee: money("delivery_fee").notNull().default(0),
    total: money("total").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | paid | pay_at_counter | refunded
    paymentId: uuid("payment_id"),
    scheduledFor: tz("scheduled_for"),
    deliveryAddress: jsonb("delivery_address").$type<AddressJson>(),
    note: text("note"),
    placedAt: tz("placed_at").notNull().defaultNow(),
    readyAt: tz("ready_at"),
    completedAt: tz("completed_at"),
    cancelledAt: tz("cancelled_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("restaurant_orders_number_uq").on(t.tenantId, t.number),
    index("restaurant_orders_status_idx").on(t.tenantId, t.status, t.placedAt),
    index("restaurant_orders_session_idx").on(t.tenantId, t.sessionId),
  ],
);

export const restaurantOrderItems = pgTable(
  "restaurant_order_items",
  {
    id: id(),
    tenantId: tenantRef(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => restaurantOrders.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id"),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: money("unit_price").notNull(),
    modifiers: jsonb("modifiers").$type<Array<{ group: string; name: string; priceDelta: number }>>().notNull().default([]),
    total: money("total").notNull(),
    note: text("note"),
    station: text("station").notNull().default("kitchen"),
    status: text("status").notNull().default("queued"), // queued | cooking | done | served | cancelled
    createdAt: createdAt(),
  },
  (t) => [index("restaurant_order_items_order_idx").on(t.tenantId, t.orderId)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    partySize: integer("party_size").notNull(),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    zone: text("zone"),
    tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"), // pending | confirmed | seated | completed | cancelled | no_show
    depositAmount: money("deposit_amount").notNull().default(0),
    paymentId: uuid("payment_id"),
    note: text("note"),
    occasion: text("occasion"),
    remindersSent: jsonb("reminders_sent").$type<string[]>().notNull().default([]),
    ...timestamps(),
  },
  (t) => [uniqueIndex("reservations_number_uq").on(t.tenantId, t.number), index("reservations_time_idx").on(t.tenantId, t.startsAt)],
);
