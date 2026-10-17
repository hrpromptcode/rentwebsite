import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers } from "./customers";

/**
 * Rental module (hotel / resort / holiday home): date-range stays per unit type.
 * Dates are civil Bangkok dates (YYYY-MM-DD); check-out is exclusive (a 3-night stay 10→13 occupies 10, 11, 12).
 */

/** Room / unit type: "Deluxe Sea View" with N identical units. */
export const rentalUnitTypes = pgTable(
  "rental_unit_types",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** image URLs, first = cover */
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    /** guests included in the base price; above this `extraGuestPrice` applies per guest per night */
    baseGuests: integer("base_guests").notNull().default(2),
    maxGuests: integer("max_guests").notNull().default(2),
    beds: text("beds"), // "เตียงคิงไซส์ 1 เตียง"
    sizeSqm: integer("size_sqm"),
    amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
    /** number of identical units of this type */
    quantity: integer("quantity").notNull().default(1),
    /** satang per night before rate rules */
    basePrice: money("base_price").notNull().default(0),
    extraGuestPrice: money("extra_guest_price").notNull().default(0),
    minNights: integer("min_nights").notNull().default(1),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("rental_unit_types_tenant_slug_uq").on(t.tenantId, t.slug)],
);

/** Seasonal / weekday pricing rule. unitTypeId null = every type. Rules apply in `priority` order, cumulatively. */
export const rentalRateRules = pgTable(
  "rental_rate_rules",
  {
    id: id(),
    tenantId: tenantRef(),
    unitTypeId: uuid("unit_type_id").references(() => rentalUnitTypes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** inclusive date range (YYYY-MM-DD); null = any date */
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    /** 0 = Sunday … 6 = Saturday; null / empty = every weekday */
    weekdays: jsonb("weekdays").$type<number[]>(),
    /** percent: value = +25 (percent change) · price: value = satang per night (replaces the base) */
    mode: text("mode").notNull().default("percent"),
    value: integer("value").notNull().default(0),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rental_rate_rules_tenant_idx").on(t.tenantId, t.unitTypeId)],
);

/** A date on which no unit of the type can be sold (maintenance, owner use). */
export const rentalBlockedDates = pgTable(
  "rental_blocked_dates",
  {
    id: id(),
    tenantId: tenantRef(),
    unitTypeId: uuid("unit_type_id")
      .notNull()
      .references(() => rentalUnitTypes.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rental_blocked_dates_uq").on(t.tenantId, t.unitTypeId, t.date)],
);

/** Add-ons: breakfast, airport pickup, late check-out… */
export const rentalExtras = pgTable(
  "rental_extras",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    description: text("description"),
    price: money("price").notNull().default(0),
    /** per_stay | per_night | per_guest_night */
    pricing: text("pricing").notNull().default("per_stay"),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("rental_extras_tenant_idx").on(t.tenantId, t.sort)],
);

export interface StayExtraLine {
  id: string;
  name: string;
  pricing: string;
  /** unit price (satang) */
  price: number;
  qty: number;
  total: number;
}

export interface StayNightLine {
  date: string;
  price: number;
}

export interface StayMeta {
  /** customer cancellation outcome */
  cancellation?: { free: boolean; refundDue: number; daysBefore: number };
  /** payment option chosen at booking */
  payOption?: "deposit" | "full" | "cash";
  [k: string]: unknown;
}

export const rentalStays = pgTable(
  "rental_stays",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(), // ST-1001
    unitTypeId: uuid("unit_type_id")
      .notNull()
      .references(() => rentalUnitTypes.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone"),
    guestEmail: text("guest_email"),
    checkIn: date("check_in", { mode: "string" }).notNull(),
    /** exclusive */
    checkOut: date("check_out", { mode: "string" }).notNull(),
    nights: integer("nights").notNull(),
    guests: integer("guests").notNull().default(2),
    /** pending | confirmed | checked_in | checked_out | cancelled | no_show */
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("online"),
    nightly: jsonb("nightly").$type<StayNightLine[]>().notNull().default([]),
    extras: jsonb("extras").$type<StayExtraLine[]>().notNull().default([]),
    roomTotal: money("room_total").notNull().default(0),
    extraGuestTotal: money("extra_guest_total").notNull().default(0),
    extrasTotal: money("extras_total").notNull().default(0),
    total: money("total").notNull().default(0),
    /** amount that confirms the stay (deposit or the full total) */
    depositAmount: money("deposit_amount").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    /** unpaid | deposit_paid | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    /** the stay's current payment */
    paymentId: uuid("payment_id"),
    accessKey: text("access_key").notNull(),
    unitNumber: text("unit_number"),
    note: text("note"),
    internalNote: text("internal_note"),
    meta: jsonb("meta").$type<StayMeta>().notNull().default({}),
    /** pending stays stop holding inventory after this instant (mirrors the payment expiry) */
    holdUntil: tz("hold_until"),
    confirmedAt: tz("confirmed_at"),
    checkedInAt: tz("checked_in_at"),
    checkedOutAt: tz("checked_out_at"),
    cancelledAt: tz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    cancelledBy: text("cancelled_by"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("rental_stays_tenant_number_uq").on(t.tenantId, t.number),
    index("rental_stays_type_dates_idx").on(t.tenantId, t.unitTypeId, t.checkIn, t.checkOut),
    index("rental_stays_customer_idx").on(t.tenantId, t.customerId),
    index("rental_stays_status_idx").on(t.tenantId, t.status, t.checkIn),
  ],
);
