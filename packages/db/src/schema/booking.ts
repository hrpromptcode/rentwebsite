import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers } from "./customers";

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("service_categories_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    tenantId: tenantRef(),
    categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    image: text("image"),
    durationMin: integer("duration_min").notNull().default(60),
    bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    price: money("price").notNull().default(0),
    priceNote: text("price_note"), // "เริ่มต้น", "ขึ้นกับหน้างาน"
    depositRequired: boolean("deposit_required").notNull().default(false),
    depositAmount: money("deposit_amount").notNull().default(0),
    capacity: integer("capacity").notNull().default(1), // >1 = class / group / room: max guests served at the same time
    requiresStaff: boolean("requires_staff").notNull().default(true), // true = every guest is served by one staff member
    /** fixed number of guests per booking (package "for 2", price per booking); null = per person (customer picks 1..capacity, price per guest) */
    seatsPerBooking: integer("seats_per_booking"),
    /** classes (course template): beginner | intermediate | advanced | all; null = not a levelled class */
    level: text("level"),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("services_tenant_slug_uq").on(t.tenantId, t.slug)],
);

/** Staff / resource (doctor, stylist, trainer, room, court). */
export const staff = pgTable(
  "staff",
  {
    id: id(),
    tenantId: tenantRef(),
    userId: text("user_id"), // optional link to platform user for self-service calendar
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    title: text("title"),
    bio: text("bio"),
    avatar: text("avatar"),
    email: text("email"),
    phone: text("phone"),
    color: text("color").notNull().default("#6366f1"),
    kind: text("kind").notNull().default("person"), // person | room | equipment
    acceptsOnlineBooking: boolean("accepts_online_booking").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("staff_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const staffServices = pgTable(
  "staff_services",
  {
    tenantId: tenantRef(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    priceOverride: money("price_override"),
    durationOverrideMin: integer("duration_override_min"),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

/**
 * Weekly recurring availability. staffId null = business hours (default for all staff).
 * serviceId set = a recurring CLASS SESSION of that service (course template): weekday + startTime is one timetable
 * slot, staffId its instructor. Session rows are not working hours – every working-hours reader filters serviceId IS NULL.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    tenantId: tenantRef(),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 0 = Sunday … 6 = Saturday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [index("availability_rules_staff_idx").on(t.tenantId, t.staffId, t.weekday), index("availability_rules_service_idx").on(t.tenantId, t.serviceId, t.weekday)],
);

/** Date-specific overrides: holidays, time off, special opening. */
export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: id(),
    tenantId: tenantRef(),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    kind: text("kind").notNull().default("closed"), // closed | open
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("availability_overrides_range_idx").on(t.tenantId, t.staffId, t.startsAt)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    /** further staff serving a party (staffed services with party size > 1); staffId is the first one */
    extraStaffIds: uuid("extra_staff_ids").array().notNull().default([]),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    status: text("status").notNull().default("pending"), // pending | confirmed | checked_in | in_progress | completed | cancelled | no_show
    source: text("source").notNull().default("online"), // online | walk_in | admin | line
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    partySize: integer("party_size").notNull().default(1),
    price: money("price").notNull().default(0),
    depositAmount: money("deposit_amount").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | deposit_paid | paid | refunded
    note: text("note"),
    internalNote: text("internal_note"),
    answers: jsonb("answers").$type<Record<string, unknown>>(),
    remindersSent: jsonb("reminders_sent").$type<string[]>().notNull().default([]),
    confirmedAt: tz("confirmed_at"),
    checkedInAt: tz("checked_in_at"),
    completedAt: tz("completed_at"),
    cancelledAt: tz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    cancelledBy: text("cancelled_by"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("bookings_tenant_number_uq").on(t.tenantId, t.number),
    index("bookings_staff_time_idx").on(t.tenantId, t.staffId, t.startsAt),
    index("bookings_tenant_time_idx").on(t.tenantId, t.startsAt),
    index("bookings_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const waitlist = pgTable(
  "booking_waitlist",
  {
    id: id(),
    tenantId: tenantRef(),
    serviceId: uuid("service_id").notNull(),
    staffId: uuid("staff_id"),
    customerId: uuid("customer_id"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    preferredDate: text("preferred_date").notNull(), // YYYY-MM-DD
    status: text("status").notNull().default("waiting"), // waiting | notified | booked | expired
    createdAt: createdAt(),
  },
  (t) => [index("waitlist_tenant_date_idx").on(t.tenantId, t.preferredDate)],
);
