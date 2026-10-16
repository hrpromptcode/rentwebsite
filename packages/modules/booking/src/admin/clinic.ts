import { qualified } from "./sql";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { bookings, clinicPackages, clinicVisits, customers, nextCounter, packageUsages, patientPackages, patients, payments, recordAccessLogs, services, staff, type Tx } from "@rentweb/db";
import { audit, decryptFromString, emitEvent, encryptToString, fail, normalizeThaiPhone, ok, pad, type Result } from "@rentweb/core";
import { createPayment, markPaid, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";
import { listClinicPackages, sessionsLeft, type ClinicPackageWithService, type PatientRow } from "../services/clinic";
import type { Actor } from "./catalog";
import type { ClinicPackageInput, PatientValues, VisitValues } from "./schemas";
import { clinicPackageSchema, visitTotals } from "./schemas";

export type { PatientRow, ClinicPackageWithService };
export type VisitRow = typeof clinicVisits.$inferSelect;
export type PatientPackageRow = typeof patientPackages.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

/* -------------------------------------------------------------------------- */
/* patients                                                                    */
/* -------------------------------------------------------------------------- */

export interface PatientListRow {
  id: string;
  hn: string;
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  gender: string | null;
  birthDate: string | null;
  phone: string | null;
  tags: string[];
  active: boolean;
  lastVisitAt: Date | null;
  visitCount: number;
  activeSessions: number;
  createdAt: Date;
}

export async function listPatients(tx: Tx, tenantId: string, f: { q?: string | null; page?: number; perPage?: number } = {}): Promise<{ rows: PatientListRow[]; total: number; page: number; pages: number }> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(patients.tenantId, tenantId)];
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const digits = q.replace(/\D/g, "");
    conds.push(or(ilike(patients.hn, like), ilike(patients.firstName, like), ilike(patients.lastName, like), ilike(patients.nickname, like), ...(digits.length >= 3 ? [ilike(patients.phone, `%${digits}%`)] : []), sql`(${patients.firstName} || ' ' || coalesce(${patients.lastName}, '')) ilike ${like}`)!);
  }
  const where = and(...conds)!;
  const [rows, [c]] = await Promise.all([
    tx
      .select({
        id: patients.id,
        hn: patients.hn,
        firstName: patients.firstName,
        lastName: patients.lastName,
        nickname: patients.nickname,
        gender: patients.gender,
        birthDate: patients.birthDate,
        phone: patients.phone,
        tags: patients.tags,
        active: patients.active,
        createdAt: patients.createdAt,
        lastVisitAt: sql<Date | null>`(select max(v.visited_at) from ${clinicVisits} v where v.patient_id = ${qualified(patients.id)})`,
        visitCount: sql<number>`(select count(*) from ${clinicVisits} v where v.patient_id = ${qualified(patients.id)})::int`,
        activeSessions: sql<number>`coalesce((select sum(greatest(pp.sessions_total - pp.sessions_used, 0)) from ${patientPackages} pp where pp.patient_id = ${qualified(patients.id)} and pp.status = 'active'), 0)::int`,
      })
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(patients).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map((r) => ({ ...r, lastVisitAt: r.lastVisitAt ? new Date(r.lastVisitAt) : null, visitCount: Number(r.visitCount), activeSessions: Number(r.activeSessions) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export interface PatientHit {
  id: string;
  hn: string;
  name: string;
  phone: string | null;
}

export async function searchPatients(tx: Tx, tenantId: string, q: string, limit = 8): Promise<PatientHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const rows = await tx
    .select({ id: patients.id, hn: patients.hn, firstName: patients.firstName, lastName: patients.lastName, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.tenantId, tenantId), eq(patients.active, true), or(ilike(patients.hn, like), ilike(patients.firstName, like), ilike(patients.lastName, like), ilike(patients.nickname, like), ilike(patients.phone, like))))
    .orderBy(desc(patients.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, hn: r.hn, name: [r.firstName, r.lastName].filter(Boolean).join(" "), phone: r.phone }));
}

function patientValues(v: PatientValues) {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    nickname: v.nickname,
    gender: v.gender,
    birthDate: v.birthDate,
    phone: v.phone ? (normalizeThaiPhone(v.phone) ?? v.phone) : null,
    email: v.email,
    bloodType: v.bloodType,
    allergies: v.allergies,
    chronicConditions: v.chronicConditions,
    currentMedications: v.currentMedications,
    emergencyContact: v.emergencyName || v.emergencyPhone ? { name: v.emergencyName ?? "", phone: v.emergencyPhone ?? "", relation: v.emergencyRelation ?? undefined } : null,
    notes: v.notes,
    tags: [...new Set(v.tags.map((t) => t.toLowerCase()))],
  };
}

/** New patient with HN "<prefix>-0001"; linked to an existing storefront customer by phone when one exists. */
export async function createPatient(tx: Tx, tenantId: string, v: PatientValues, opts: { hnPrefix: string }, actor: Actor): Promise<Result<{ id: string; hn: string }, string>> {
  const values = patientValues(v);
  let customerId: string | null = null;
  if (values.phone) {
    const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.phone, values.phone))).limit(1);
    customerId = c?.id ?? null;
    if (customerId) {
      const [linked] = await tx.select({ id: patients.id, hn: patients.hn }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.customerId, customerId))).limit(1);
      if (linked) return fail(`เบอร์นี้มีประวัติผู้ป่วยอยู่แล้ว (${linked.hn})`);
    }
  }
  const hn = `${opts.hnPrefix}-${pad(await nextCounter(tx, tenantId, "hn", 0), 4)}`;
  const [row] = await tx.insert(patients).values({ tenantId, hn, customerId, source: "admin", ...values }).returning({ id: patients.id, hn: patients.hn });
  await emitEvent(tx, { tenantId, type: "patient.created", payload: { patientId: row!.id, hn, customerId, by: actor.userId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "patient.create", targetType: "patient", targetId: row!.id, diff: { hn } });
  return ok(row!);
}

export async function updatePatient(tx: Tx, tenantId: string, id: string, v: PatientValues, actor: Actor): Promise<boolean> {
  const rows = await tx.update(patients).set(patientValues(v)).where(and(eq(patients.tenantId, tenantId), eq(patients.id, id))).returning({ id: patients.id });
  if (rows.length) {
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "patient.update", targetType: "patient", targetId: id });
    await logRecordAccess(tx, tenantId, { patientId: id, userId: actor.userId, action: "edit", resource: "patient", resourceId: id });
  }
  return rows.length > 0;
}

export async function setPatientActive(tx: Tx, tenantId: string, id: string, active: boolean, actor: Actor): Promise<boolean> {
  const rows = await tx.update(patients).set({ active }).where(and(eq(patients.tenantId, tenantId), eq(patients.id, id))).returning({ id: patients.id });
  if (rows.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: active ? "patient.activate" : "patient.deactivate", targetType: "patient", targetId: id });
  return rows.length > 0;
}

export async function setConsent(tx: Tx, tenantId: string, patientId: string, key: string, granted: boolean, opts: { version: string; by: string }): Promise<Result<Record<string, { at: string; version: string; by?: string }>, string>> {
  const [p] = await tx.select({ consents: patients.consents }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId))).limit(1).for("update");
  if (!p) return fail("ไม่พบผู้ป่วย");
  const consents = { ...(p.consents ?? {}) };
  if (granted) consents[key] = { at: new Date().toISOString(), version: opts.version, by: opts.by };
  else delete consents[key];
  await tx.update(patients).set({ consents }).where(eq(patients.id, patientId));
  await audit(tx, { tenantId, actorType: "user", actorId: opts.by, action: granted ? "patient.consent.grant" : "patient.consent.revoke", targetType: "patient", targetId: patientId, diff: { key, version: opts.version } });
  return ok(consents);
}

/** PDPA access log – every view/edit/export of a medical record. */
export async function logRecordAccess(tx: Tx, tenantId: string, entry: { patientId: string; userId: string; action: "view" | "edit" | "export" | "print"; resource: "patient" | "visit" | "photo"; resourceId?: string | null; ip?: string | null }): Promise<void> {
  await tx.insert(recordAccessLogs).values({ tenantId, patientId: entry.patientId, userId: entry.userId, action: entry.action, resource: entry.resource, resourceId: entry.resourceId ?? null, ip: entry.ip ?? null });
}

export interface PatientVisitItem {
  id: string;
  visitedAt: Date;
  status: string;
  chiefComplaint: string | null;
  diagnosis: string | null;
  total: number;
  paymentStatus: string;
  doctorName: string | null;
  procedureCount: number;
}

export interface PatientPackageItem extends PatientPackageRow {
  sessionsLeft: number;
  serviceName: string | null;
  isExpired: boolean;
  usages: Array<{ id: string; usedAt: Date; note: string | null; visitId: string | null }>;
}

export interface AdminPatientDetail {
  patient: PatientRow;
  customer: { id: string; name: string | null; totalSpent: number } | null;
  visits: PatientVisitItem[];
  packages: PatientPackageItem[];
  accessLogCount: number;
  recentAccess: Array<{ userId: string; action: string; resource: string; createdAt: Date }>;
}

export async function getPatientAdmin(tx: Tx, tenantId: string, id: string): Promise<AdminPatientDetail | null> {
  const [p] = await tx.select().from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, id))).limit(1);
  if (!p) return null;
  const now = new Date();
  const [visits, pkgs, [logCount], recentAccess, customer] = await Promise.all([
    tx
      .select({
        id: clinicVisits.id,
        visitedAt: clinicVisits.visitedAt,
        status: clinicVisits.status,
        chiefComplaint: clinicVisits.chiefComplaint,
        diagnosis: clinicVisits.diagnosis,
        total: clinicVisits.total,
        paymentStatus: clinicVisits.paymentStatus,
        doctorName: staff.name,
        procedures: clinicVisits.procedures,
      })
      .from(clinicVisits)
      .leftJoin(staff, eq(clinicVisits.doctorId, staff.id))
      .where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.patientId, id)))
      .orderBy(desc(clinicVisits.visitedAt))
      .limit(50),
    tx
      .select({ pp: patientPackages, serviceName: services.name })
      .from(patientPackages)
      .innerJoin(clinicPackages, eq(patientPackages.packageId, clinicPackages.id))
      .leftJoin(services, eq(clinicPackages.serviceId, services.id))
      .where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.patientId, id)))
      .orderBy(desc(patientPackages.purchasedAt)),
    tx.select({ c: count() }).from(recordAccessLogs).where(and(eq(recordAccessLogs.tenantId, tenantId), eq(recordAccessLogs.patientId, id))),
    tx.select({ userId: recordAccessLogs.userId, action: recordAccessLogs.action, resource: recordAccessLogs.resource, createdAt: recordAccessLogs.createdAt }).from(recordAccessLogs).where(and(eq(recordAccessLogs.tenantId, tenantId), eq(recordAccessLogs.patientId, id))).orderBy(desc(recordAccessLogs.createdAt)).limit(5),
    p.customerId ? tx.select({ id: customers.id, name: customers.name, totalSpent: customers.totalSpent }).from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.id, p.customerId))).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const ppIds = pkgs.map((x) => x.pp.id);
  const usages = ppIds.length ? await tx.select({ id: packageUsages.id, patientPackageId: packageUsages.patientPackageId, usedAt: packageUsages.usedAt, note: packageUsages.note, visitId: packageUsages.visitId }).from(packageUsages).where(and(eq(packageUsages.tenantId, tenantId), inArray(packageUsages.patientPackageId, ppIds))).orderBy(desc(packageUsages.usedAt)) : [];
  return {
    patient: p,
    customer,
    visits: visits.map((v) => ({ ...v, procedureCount: (v.procedures ?? []).length })),
    packages: pkgs.map(({ pp, serviceName }) => ({
      ...pp,
      sessionsLeft: sessionsLeft(pp),
      serviceName,
      isExpired: pp.status === "active" && !!pp.expiresAt && pp.expiresAt < now,
      usages: usages.filter((u) => u.patientPackageId === pp.id).map(({ id, usedAt, note, visitId }) => ({ id, usedAt, note, visitId })),
    })),
    accessLogCount: Number(logCount?.c ?? 0),
    recentAccess,
  };
}

/* -------------------------------------------------------------------------- */
/* packages owned by patients                                                  */
/* -------------------------------------------------------------------------- */

/** Consumes one session: package_usages row + sessions_used++, exhausted when none left. */
export async function usePackageSession(tx: Tx, tenantId: string, patientPackageId: string, opts: { visitId?: string | null; byStaffId?: string | null; note?: string | null }, actor: Actor): Promise<Result<{ sessionsLeft: number; status: string }, string>> {
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, patientPackageId))).limit(1).for("update");
  if (!pp) return fail("ไม่พบแพ็กเกจของผู้ป่วย");
  if (pp.status !== "active") return fail(pp.status === "pending" ? "แพ็กเกจนี้ยังไม่ได้ชำระเงิน" : "แพ็กเกจนี้ใช้ครบ/หมดอายุแล้ว");
  if (pp.expiresAt && pp.expiresAt < new Date()) {
    await tx.update(patientPackages).set({ status: "expired" }).where(eq(patientPackages.id, pp.id));
    return fail("แพ็กเกจนี้หมดอายุแล้ว");
  }
  if (sessionsLeft(pp) <= 0) {
    await tx.update(patientPackages).set({ status: "exhausted" }).where(eq(patientPackages.id, pp.id));
    return fail("แพ็กเกจนี้ใช้ครบแล้ว");
  }
  const used = pp.sessionsUsed + 1;
  const status = used >= pp.sessionsTotal ? "exhausted" : "active";
  await tx.insert(packageUsages).values({ tenantId, patientPackageId: pp.id, visitId: opts.visitId ?? null, byStaffId: opts.byStaffId ?? null, note: opts.note ?? null });
  await tx.update(patientPackages).set({ sessionsUsed: used, status }).where(eq(patientPackages.id, pp.id));
  await emitEvent(tx, { tenantId, type: "patient_package.used", payload: { patientPackageId: pp.id, patientId: pp.patientId, sessionsUsed: used, sessionsTotal: pp.sessionsTotal, status, visitId: opts.visitId ?? null } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "patient_package.use", targetType: "patient_package", targetId: pp.id, diff: { sessionsUsed: used, status } });
  return ok({ sessionsLeft: pp.sessionsTotal - used, status });
}

const PROVIDER_FOR: Record<"cash" | "transfer", { provider: PaymentProvider; method: PaymentMethod }> = {
  cash: { provider: "cash", method: "cash" },
  transfer: { provider: "bank_transfer", method: "slip" },
};

/** Sells a package at the counter: active immediately, payment recorded as paid (cash / transfer seen by staff). */
export async function sellPackage(tx: Tx, tenantId: string, input: { patientId: string; packageId: string; method: "cash" | "transfer" }, actor: Actor): Promise<Result<{ patientPackageId: string }, string>> {
  const [p] = await tx.select({ id: patients.id, customerId: patients.customerId, hn: patients.hn }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId))).limit(1);
  if (!p) return fail("ไม่พบผู้ป่วย");
  const [pkg] = await tx.select().from(clinicPackages).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, input.packageId))).limit(1);
  if (!pkg || !pkg.active) return fail("ไม่พบแพ็กเกจ หรือแพ็กเกจปิดการขายแล้ว");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + pkg.validityDays * 86_400_000);
  const [pp] = await tx
    .insert(patientPackages)
    .values({ tenantId, patientId: p.id, packageId: pkg.id, packageName: pkg.name, sessionsTotal: pkg.sessions, sessionsUsed: 0, pricePaid: pkg.price, purchasedAt: now, expiresAt, status: "active" })
    .returning({ id: patientPackages.id });
  const m = PROVIDER_FOR[input.method];
  const pay = await createPayment(tx, tenantId, { refType: "patient_package", refId: pp!.id, amount: pkg.price, provider: m.provider, method: m.method, customerId: p.customerId, metadata: { packageId: pkg.id, packageName: pkg.name, hn: p.hn, by: actor.userId } });
  await tx.update(patientPackages).set({ paymentId: pay.id }).where(eq(patientPackages.id, pp!.id));
  // markPaid runs onPatientPackagePaid only for "pending" packages – ours is already active, so it is a no-op there
  await markPaid(tx, tenantId, pay.id, { verifiedBy: actor.userId });
  await emitEvent(tx, { tenantId, type: "patient_package.purchased", payload: { patientPackageId: pp!.id, patientId: p.id, packageId: pkg.id, amount: pkg.price, paymentId: pay.id, source: "admin" } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "patient_package.sell", targetType: "patient_package", targetId: pp!.id, diff: { packageId: pkg.id, amount: pkg.price, method: input.method } });
  return ok({ patientPackageId: pp!.id });
}

/* -------------------------------------------------------------------------- */
/* visits                                                                      */
/* -------------------------------------------------------------------------- */

export interface VisitListRow {
  id: string;
  visitedAt: Date;
  status: string;
  chiefComplaint: string | null;
  diagnosis: string | null;
  total: number;
  paymentStatus: string;
  patientId: string;
  hn: string;
  patientName: string;
  patientPhone: string | null;
  doctorName: string | null;
  doctorColor: string | null;
  bookingNumber: string | null;
  procedureCount: number;
}

export async function listVisits(tx: Tx, tenantId: string, f: { from: Date; to: Date; status?: string | null; q?: string | null }): Promise<VisitListRow[]> {
  const conds: SQL[] = [eq(clinicVisits.tenantId, tenantId), gte(clinicVisits.visitedAt, f.from), lt(clinicVisits.visitedAt, f.to)];
  if (f.status && f.status !== "all") conds.push(eq(clinicVisits.status, f.status));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(patients.hn, like), ilike(patients.firstName, like), ilike(patients.lastName, like), ilike(patients.phone, like))!);
  }
  const rows = await tx
    .select({
      id: clinicVisits.id,
      visitedAt: clinicVisits.visitedAt,
      status: clinicVisits.status,
      chiefComplaint: clinicVisits.chiefComplaint,
      diagnosis: clinicVisits.diagnosis,
      total: clinicVisits.total,
      paymentStatus: clinicVisits.paymentStatus,
      patientId: patients.id,
      hn: patients.hn,
      firstName: patients.firstName,
      lastName: patients.lastName,
      patientPhone: patients.phone,
      doctorName: staff.name,
      doctorColor: staff.color,
      bookingNumber: bookings.number,
      procedures: clinicVisits.procedures,
    })
    .from(clinicVisits)
    .innerJoin(patients, eq(clinicVisits.patientId, patients.id))
    .leftJoin(staff, eq(clinicVisits.doctorId, staff.id))
    .leftJoin(bookings, eq(clinicVisits.bookingId, bookings.id))
    .where(and(...conds))
    .orderBy(asc(clinicVisits.visitedAt))
    .limit(500);
  return rows.map((r) => ({ ...r, patientName: [r.firstName, r.lastName].filter(Boolean).join(" "), procedureCount: (r.procedures ?? []).length }));
}

/** Today's bookings that do not have a visit yet (quick "เริ่มตรวจ" from the appointment). */
export interface BookingForVisit {
  id: string;
  number: string;
  startsAt: Date;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerId: string | null;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  /** patient matched by customer / phone, when one exists */
  patientId: string | null;
  patientHn: string | null;
}

export async function listBookingsForVisits(tx: Tx, tenantId: string, range: { from: Date; to: Date }): Promise<BookingForVisit[]> {
  const rows = await tx
    .select({
      id: bookings.id,
      number: bookings.number,
      startsAt: bookings.startsAt,
      status: bookings.status,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      customerId: bookings.customerId,
      serviceName: services.name,
      staffId: bookings.staffId,
      staffName: staff.name,
      hasVisit: sql<boolean>`exists (select 1 from ${clinicVisits} v where v.booking_id = ${qualified(bookings.id)})`,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(staff, eq(bookings.staffId, staff.id))
    .where(and(eq(bookings.tenantId, tenantId), gte(bookings.startsAt, range.from), lt(bookings.startsAt, range.to), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"])))
    .orderBy(asc(bookings.startsAt));
  const pending = rows.filter((r) => !r.hasVisit);
  if (!pending.length) return [];
  const custIds = pending.map((r) => r.customerId).filter((x): x is string => !!x);
  const phones = pending.map((r) => r.customerPhone).filter((x): x is string => !!x);
  const matches = custIds.length || phones.length ? await tx.select({ id: patients.id, hn: patients.hn, customerId: patients.customerId, phone: patients.phone }).from(patients).where(and(eq(patients.tenantId, tenantId), or(...(custIds.length ? [inArray(patients.customerId, custIds)] : []), ...(phones.length ? [inArray(patients.phone, phones)] : [])))) : [];
  return pending.map((r) => {
    const m = matches.find((p) => (r.customerId && p.customerId === r.customerId) || (r.customerPhone && p.phone === r.customerPhone)) ?? null;
    return { id: r.id, number: r.number, startsAt: r.startsAt, status: r.status, customerName: r.customerName, customerPhone: r.customerPhone, customerId: r.customerId, serviceName: r.serviceName, staffId: r.staffId, staffName: r.staffName, patientId: m?.id ?? null, patientHn: m?.hn ?? null };
  });
}

export async function createVisit(tx: Tx, tenantId: string, input: { patientId: string; bookingId: string | null; doctorId: string | null; chiefComplaint: string | null }, actor: Actor): Promise<Result<{ id: string }, string>> {
  const [p] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId))).limit(1);
  if (!p) return fail("ไม่พบผู้ป่วย");
  let doctorId = input.doctorId;
  let procedures: Array<{ serviceId?: string; name: string; price: number; staffId?: string }> = [];
  if (input.bookingId) {
    const [b] = await tx
      .select({ id: bookings.id, staffId: bookings.staffId, status: bookings.status, serviceId: bookings.serviceId, serviceName: services.name, price: bookings.price })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, input.bookingId)))
      .limit(1);
    if (!b) return fail("ไม่พบการจอง");
    const [dup] = await tx.select({ id: clinicVisits.id }).from(clinicVisits).where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.bookingId, b.id))).limit(1);
    if (dup) return ok({ id: dup.id });
    doctorId = doctorId ?? b.staffId;
    procedures = [{ serviceId: b.serviceId, name: b.serviceName, price: b.price, staffId: b.staffId ?? undefined }];
    if (b.status === "pending" || b.status === "confirmed") await tx.update(bookings).set({ status: "checked_in", checkedInAt: new Date() }).where(eq(bookings.id, b.id));
  }
  if (doctorId) {
    const [d] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, doctorId))).limit(1);
    if (!d) doctorId = null;
  }
  const totals = visitTotals({ procedures, prescriptions: [], discount: 0 });
  const [row] = await tx
    .insert(clinicVisits)
    .values({ tenantId, patientId: input.patientId, bookingId: input.bookingId, doctorId, chiefComplaint: input.chiefComplaint, procedures, subtotal: totals.subtotal, total: totals.total, status: "open" })
    .returning({ id: clinicVisits.id });
  await emitEvent(tx, { tenantId, type: "clinic_visit.opened", payload: { visitId: row!.id, patientId: input.patientId, bookingId: input.bookingId, doctorId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_visit.create", targetType: "clinic_visit", targetId: row!.id, diff: { patientId: input.patientId, bookingId: input.bookingId } });
  await logRecordAccess(tx, tenantId, { patientId: input.patientId, userId: actor.userId, action: "edit", resource: "visit", resourceId: row!.id });
  return ok({ id: row!.id });
}

export interface AdminVisitDetail {
  visit: VisitRow;
  /** decrypted clinical notes ("" when none; null when decryption failed) */
  notes: string | null;
  patient: Pick<PatientRow, "id" | "hn" | "firstName" | "lastName" | "nickname" | "phone" | "birthDate" | "gender" | "allergies" | "chronicConditions" | "currentMedications" | "bloodType" | "consents">;
  doctor: { id: string; name: string } | null;
  booking: { id: string; number: string; startsAt: Date; status: string } | null;
  payment: PaymentRow | null;
  packages: Array<{ id: string; packageName: string; sessionsLeft: number; status: string; expiresAt: Date | null }>;
}

export async function getVisitAdmin(tx: Tx, tenantId: string, id: string): Promise<AdminVisitDetail | null> {
  const [v] = await tx.select().from(clinicVisits).where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.id, id))).limit(1);
  if (!v) return null;
  const [[p], doctor, booking, payment, pkgs] = await Promise.all([
    tx
      .select({ id: patients.id, hn: patients.hn, firstName: patients.firstName, lastName: patients.lastName, nickname: patients.nickname, phone: patients.phone, birthDate: patients.birthDate, gender: patients.gender, allergies: patients.allergies, chronicConditions: patients.chronicConditions, currentMedications: patients.currentMedications, bloodType: patients.bloodType, consents: patients.consents })
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, v.patientId)))
      .limit(1),
    v.doctorId ? tx.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, v.doctorId))).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    v.bookingId ? tx.select({ id: bookings.id, number: bookings.number, startsAt: bookings.startsAt, status: bookings.status }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, v.bookingId))).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    v.paymentId ? tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, v.paymentId))).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    tx.select({ id: patientPackages.id, packageName: patientPackages.packageName, sessionsTotal: patientPackages.sessionsTotal, sessionsUsed: patientPackages.sessionsUsed, status: patientPackages.status, expiresAt: patientPackages.expiresAt }).from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.patientId, v.patientId), eq(patientPackages.status, "active"))).orderBy(asc(patientPackages.expiresAt)),
  ]);
  if (!p) return null;
  let notes: string | null = "";
  if (v.notesEncrypted) {
    try {
      notes = decryptFromString(v.notesEncrypted);
    } catch {
      notes = null;
    }
  }
  return { visit: v, notes, patient: p, doctor, booking, payment, packages: pkgs.map((x) => ({ id: x.id, packageName: x.packageName, sessionsLeft: sessionsLeft(x), status: x.status, expiresAt: x.expiresAt })) };
}

export async function saveVisit(tx: Tx, tenantId: string, id: string, v: VisitValues, actor: Actor): Promise<Result<{ total: number }, string>> {
  const [cur] = await tx.select({ id: clinicVisits.id, status: clinicVisits.status, patientId: clinicVisits.patientId }).from(clinicVisits).where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.id, id))).limit(1).for("update");
  if (!cur) return fail("ไม่พบการตรวจ");
  if (cur.status === "cancelled") return fail("การตรวจนี้ถูกยกเลิกแล้ว");
  const totals = visitTotals(v);
  const vitals: Record<string, string> = {};
  for (const [k, val] of Object.entries(v.vitals ?? {})) if (val) vitals[k] = val;
  await tx
    .update(clinicVisits)
    .set({
      doctorId: v.doctorId,
      chiefComplaint: v.chiefComplaint,
      vitals: Object.keys(vitals).length ? vitals : null,
      notesEncrypted: v.notes ? encryptToString(v.notes) : null,
      diagnosis: v.diagnosis,
      procedures: v.procedures.map((p) => ({ serviceId: p.serviceId ?? undefined, name: p.name, price: p.price, staffId: p.staffId ?? undefined })),
      prescriptions: v.prescriptions.map((p) => ({ name: p.name, dose: p.dose ?? undefined, qty: p.qty, price: p.price })),
      photosBefore: v.photosBefore,
      photosAfter: v.photosAfter,
      subtotal: totals.subtotal,
      discount: Math.min(v.discount, totals.subtotal),
      total: totals.total,
      nextVisitNote: v.nextVisitNote,
    })
    .where(eq(clinicVisits.id, id));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_visit.update", targetType: "clinic_visit", targetId: id, diff: { total: totals.total, procedures: v.procedures.length, prescriptions: v.prescriptions.length } });
  await logRecordAccess(tx, tenantId, { patientId: cur.patientId, userId: actor.userId, action: "edit", resource: "visit", resourceId: id });
  return ok({ total: totals.total });
}

/** Completes the visit; cash / transfer creates an "invoice" payment and marks it paid at once. */
export async function completeVisit(tx: Tx, tenantId: string, id: string, method: "cash" | "transfer" | "none", actor: Actor): Promise<Result<{ paymentStatus: string }, string>> {
  const [v] = await tx.select().from(clinicVisits).where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.id, id))).limit(1).for("update");
  if (!v) return fail("ไม่พบการตรวจ");
  if (v.status === "completed") return fail("การตรวจนี้เสร็จสิ้นแล้ว");
  if (v.status === "cancelled") return fail("การตรวจนี้ถูกยกเลิกแล้ว");
  const now = new Date();
  let paymentStatus = v.paymentStatus;
  let paymentId = v.paymentId;
  if (v.total > 0 && method !== "none" && v.paymentStatus !== "paid") {
    const [p] = await tx.select({ customerId: patients.customerId, hn: patients.hn }).from(patients).where(eq(patients.id, v.patientId)).limit(1);
    const m = PROVIDER_FOR[method];
    const pay = await createPayment(tx, tenantId, { refType: "invoice", refId: v.id, amount: v.total, provider: m.provider, method: m.method, customerId: p?.customerId ?? null, metadata: { kind: "clinic_visit", visitId: v.id, hn: p?.hn, by: actor.userId } });
    await markPaid(tx, tenantId, pay.id, { verifiedBy: actor.userId });
    paymentStatus = "paid";
    paymentId = pay.id;
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_visit.payment", targetType: "payment", targetId: pay.id, diff: { visitId: v.id, amount: v.total, method } });
  } else if (v.total === 0) paymentStatus = "waived";
  await tx.update(clinicVisits).set({ status: "completed", completedAt: now, paymentStatus, paymentId }).where(eq(clinicVisits.id, v.id));
  if (v.bookingId) {
    await tx.update(bookings).set({ status: "completed", completedAt: now }).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, v.bookingId), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"])));
  }
  await emitEvent(tx, { tenantId, type: "clinic_visit.completed", payload: { visitId: v.id, patientId: v.patientId, total: v.total, paymentStatus, bookingId: v.bookingId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_visit.complete", targetType: "clinic_visit", targetId: v.id, diff: { total: v.total, paymentStatus } });
  return ok({ paymentStatus });
}

export async function cancelVisit(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null, string>> {
  const [v] = await tx.select({ status: clinicVisits.status, paymentStatus: clinicVisits.paymentStatus }).from(clinicVisits).where(and(eq(clinicVisits.tenantId, tenantId), eq(clinicVisits.id, id))).limit(1);
  if (!v) return fail("ไม่พบการตรวจ");
  if (v.status === "completed") return fail("การตรวจที่เสร็จสิ้นแล้วยกเลิกไม่ได้");
  await tx.update(clinicVisits).set({ status: "cancelled" }).where(eq(clinicVisits.id, id));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_visit.cancel", targetType: "clinic_visit", targetId: id });
  return ok(null);
}

export async function visitKpis(tx: Tx, tenantId: string, from: Date, to: Date): Promise<{ total: number; open: number; completed: number; revenue: number }> {
  const [r] = await tx
    .select({
      total: sql<number>`count(*) filter (where ${clinicVisits.status} <> 'cancelled')::int`,
      open: sql<number>`count(*) filter (where ${clinicVisits.status} = 'open')::int`,
      completed: sql<number>`count(*) filter (where ${clinicVisits.status} = 'completed')::int`,
      revenue: sql<number>`coalesce(sum(${clinicVisits.total}) filter (where ${clinicVisits.paymentStatus} = 'paid'), 0)::int`,
    })
    .from(clinicVisits)
    .where(and(eq(clinicVisits.tenantId, tenantId), gte(clinicVisits.visitedAt, from), lt(clinicVisits.visitedAt, to)));
  return { total: Number(r?.total ?? 0), open: Number(r?.open ?? 0), completed: Number(r?.completed ?? 0), revenue: Number(r?.revenue ?? 0) };
}

/* -------------------------------------------------------------------------- */
/* clinic packages (catalog)                                                   */
/* -------------------------------------------------------------------------- */

export interface AdminPackageRow extends ClinicPackageWithService {
  sold: number;
  activeOwners: number;
}

export async function listPackagesAdmin(tx: Tx, tenantId: string): Promise<AdminPackageRow[]> {
  const list = await listClinicPackages(tx, tenantId, { includeInactive: true });
  if (!list.length) return [];
  const stats = await tx
    .select({ packageId: patientPackages.packageId, sold: count(), active: sql<number>`count(*) filter (where ${patientPackages.status} = 'active')::int` })
    .from(patientPackages)
    .where(and(eq(patientPackages.tenantId, tenantId), inArray(patientPackages.packageId, list.map((p) => p.id))))
    .groupBy(patientPackages.packageId);
  const map = new Map(stats.map((s) => [s.packageId, s]));
  return list.map((p) => ({ ...p, sold: Number(map.get(p.id)?.sold ?? 0), activeOwners: Number(map.get(p.id)?.active ?? 0) }));
}

export async function savePackage(tx: Tx, tenantId: string, id: string | null, input: ClinicPackageInput, actor: Actor): Promise<Result<{ id: string }, { field: string; message: string }>> {
  const parsed = clinicPackageSchema.safeParse(input);
  if (!parsed.success) return fail({ field: parsed.error.issues[0]?.path.join(".") || "_", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const v = parsed.data;
  if (v.serviceId) {
    const [s] = await tx.select({ id: services.id }).from(services).where(and(eq(services.tenantId, tenantId), eq(services.id, v.serviceId))).limit(1);
    if (!s) return fail({ field: "serviceId", message: "ไม่พบบริการ" });
  }
  const values = { name: v.name, description: v.description, image: v.image, serviceId: v.serviceId, sessions: v.sessions, price: v.price, compareAtPrice: v.compareAtPrice, validityDays: v.validityDays, active: v.active, sort: v.sort };
  if (id) {
    const [row] = await tx.update(clinicPackages).set(values).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, id))).returning({ id: clinicPackages.id });
    if (!row) return fail({ field: "_", message: "ไม่พบแพ็กเกจ" });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_package.update", targetType: "clinic_package", targetId: id, diff: { name: v.name, price: v.price, sessions: v.sessions } });
    return ok(row);
  }
  const [row] = await tx.insert(clinicPackages).values({ tenantId, ...values }).returning({ id: clinicPackages.id });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_package.create", targetType: "clinic_package", targetId: row!.id, diff: { name: v.name, price: v.price, sessions: v.sessions } });
  return ok(row!);
}

export async function setPackageActive(tx: Tx, tenantId: string, id: string, active: boolean, actor: Actor): Promise<boolean> {
  const rows = await tx.update(clinicPackages).set({ active }).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, id))).returning({ id: clinicPackages.id });
  if (rows.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_package.flags", targetType: "clinic_package", targetId: id, diff: { active } });
  return rows.length > 0;
}

/** Hard delete only when nobody owns it (FK restrict); otherwise tell the admin to deactivate. */
export async function deletePackage(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null, string>> {
  const [{ c } = { c: 0 }] = await tx.select({ c: count() }).from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.packageId, id)));
  if (Number(c) > 0) return fail("มีผู้ป่วยถือแพ็กเกจนี้อยู่ ลบไม่ได้ – ปิดการขายแทน");
  const rows = await tx.delete(clinicPackages).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, id))).returning({ id: clinicPackages.id });
  if (!rows.length) return fail("ไม่พบแพ็กเกจ");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "clinic_package.delete", targetType: "clinic_package", targetId: id });
  return ok(null);
}

export async function listDoctors(tx: Tx, tenantId: string): Promise<Array<{ id: string; name: string; title: string | null; color: string }>> {
  return tx.select({ id: staff.id, name: staff.name, title: staff.title, color: staff.color }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.active, true), eq(staff.kind, "person"))).orderBy(asc(staff.sort), asc(staff.name));
}

export async function listProcedureOptions(tx: Tx, tenantId: string): Promise<Array<{ id: string; name: string; price: number }>> {
  return tx.select({ id: services.id, name: services.name, price: services.price }).from(services).where(and(eq(services.tenantId, tenantId), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name));
}
