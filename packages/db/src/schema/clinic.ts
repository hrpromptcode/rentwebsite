import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers, type AddressJson } from "./customers";
import { bookings, services, staff } from "./booking";

/** Patients extend customers with medical-grade fields. Sensitive fields are encrypted at the app layer. */
export const patients = pgTable(
  "patients",
  {
    id: id(),
    tenantId: tenantRef(),
    hn: text("hn").notNull(), // hospital number, per tenant sequence
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    nickname: text("nickname"),
    gender: text("gender"),
    birthDate: text("birth_date"), // YYYY-MM-DD
    nationalIdEncrypted: text("national_id_encrypted"),
    nationalIdHint: text("national_id_hint"),
    phone: text("phone"),
    email: text("email"),
    lineUserId: text("line_user_id"),
    address: jsonb("address").$type<AddressJson>(),
    bloodType: text("blood_type"),
    allergies: text("allergies"),
    chronicConditions: text("chronic_conditions"),
    currentMedications: text("current_medications"),
    emergencyContact: jsonb("emergency_contact").$type<{ name: string; phone: string; relation?: string }>(),
    avatar: text("avatar"),
    notes: text("notes"),
    tags: text("tags").array().notNull().default([]),
    /** consents: { treatment: {at, version}, photo: {...}, marketing: {...} } */
    consents: jsonb("consents").$type<Record<string, { at: string; version: string; by?: string }>>().notNull().default({}),
    source: text("source"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("patients_tenant_hn_uq").on(t.tenantId, t.hn),
    index("patients_tenant_phone_idx").on(t.tenantId, t.phone),
    index("patients_tenant_name_idx").on(t.tenantId, t.firstName, t.lastName),
  ],
);

export const clinicVisits = pgTable(
  "clinic_visits",
  {
    id: id(),
    tenantId: tenantRef(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    doctorId: uuid("doctor_id").references(() => staff.id, { onDelete: "set null" }),
    visitedAt: tz("visited_at").notNull().defaultNow(),
    status: text("status").notNull().default("open"), // open | completed | cancelled
    chiefComplaint: text("chief_complaint"),
    vitals: jsonb("vitals").$type<Record<string, string | number>>(),
    /** SOAP notes etc. – encrypted JSON string */
    notesEncrypted: text("notes_encrypted"),
    diagnosis: text("diagnosis"),
    procedures: jsonb("procedures").$type<Array<{ serviceId?: string; name: string; price: number; staffId?: string }>>().notNull().default([]),
    prescriptions: jsonb("prescriptions").$type<Array<{ name: string; dose?: string; qty?: number; price?: number }>>().notNull().default([]),
    photosBefore: jsonb("photos_before").$type<string[]>().notNull().default([]),
    photosAfter: jsonb("photos_after").$type<string[]>().notNull().default([]),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    total: money("total").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paymentId: uuid("payment_id"),
    nextVisitNote: text("next_visit_note"),
    completedAt: tz("completed_at"),
    ...timestamps(),
  },
  (t) => [index("clinic_visits_patient_idx").on(t.tenantId, t.patientId, t.visitedAt)],
);

export const clinicPackages = pgTable(
  "clinic_packages",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    description: text("description"),
    image: text("image"),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    sessions: integer("sessions").notNull(), // number of uses
    price: money("price").notNull(),
    compareAtPrice: money("compare_at_price"),
    validityDays: integer("validity_days").notNull().default(365),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("clinic_packages_tenant_idx").on(t.tenantId, t.sort)],
);

export const patientPackages = pgTable(
  "patient_packages",
  {
    id: id(),
    tenantId: tenantRef(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => clinicPackages.id, { onDelete: "restrict" }),
    packageName: text("package_name").notNull(),
    sessionsTotal: integer("sessions_total").notNull(),
    sessionsUsed: integer("sessions_used").notNull().default(0),
    pricePaid: money("price_paid").notNull(),
    paymentId: uuid("payment_id"),
    purchasedAt: tz("purchased_at").notNull().defaultNow(),
    expiresAt: tz("expires_at"),
    status: text("status").notNull().default("active"), // active | exhausted | expired | refunded
    ...timestamps(),
  },
  (t) => [index("patient_packages_patient_idx").on(t.tenantId, t.patientId, t.status)],
);

export const packageUsages = pgTable(
  "package_usages",
  {
    id: id(),
    tenantId: tenantRef(),
    patientPackageId: uuid("patient_package_id")
      .notNull()
      .references(() => patientPackages.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id").references(() => clinicVisits.id, { onDelete: "set null" }),
    usedAt: tz("used_at").notNull().defaultNow(),
    byStaffId: uuid("by_staff_id"),
    note: text("note"),
  },
  (t) => [index("package_usages_pkg_idx").on(t.tenantId, t.patientPackageId)],
);

/** Who opened whose medical record – PDPA access log for sensitive data. */
export const recordAccessLogs = pgTable(
  "record_access_logs",
  {
    id: id(),
    tenantId: tenantRef(),
    patientId: uuid("patient_id").notNull(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(), // view | edit | export | print
    resource: text("resource").notNull(), // patient | visit | photo
    resourceId: text("resource_id"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("record_access_logs_patient_idx").on(t.tenantId, t.patientId, t.createdAt)],
);
