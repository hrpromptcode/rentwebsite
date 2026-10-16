import { and, asc, desc, eq, inArray, nextCounter, type Tx } from "@rentweb/db";
import { clinicPackages, packageUsages, patientPackages, patients, payments, services } from "@rentweb/db";
import { emitEvent, fail, isUuid, ok, pad, type Result } from "@rentweb/core";
import { normalizeThaiPhone } from "@rentweb/core";
import { cancelPayment, createPayment, enabledMethods, listPaymentsFor, paymentSettings, refundRequired, resolvePromptpayId, type PaymentClosedInfo, type PaymentMethod, type PaymentPaidResult, type PaymentProvider } from "@rentweb/core/payments";

export type ClinicPackageRow = typeof clinicPackages.$inferSelect;
export type PatientRow = typeof patients.$inferSelect;
export type PatientPackageRow = typeof patientPackages.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export interface ClinicPackageWithService extends ClinicPackageRow {
  serviceName: string | null;
  serviceSlug: string | null;
}

export async function listClinicPackages(tx: Tx, tenantId: string, opts: { limit?: number; includeInactive?: boolean } = {}): Promise<ClinicPackageWithService[]> {
  const conds = [eq(clinicPackages.tenantId, tenantId)];
  if (!opts.includeInactive) conds.push(eq(clinicPackages.active, true));
  const q = tx
    .select({ p: clinicPackages, serviceName: services.name, serviceSlug: services.slug })
    .from(clinicPackages)
    .leftJoin(services, eq(clinicPackages.serviceId, services.id))
    .where(and(...conds))
    .orderBy(asc(clinicPackages.sort), asc(clinicPackages.name));
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  return rows.map((r) => ({ ...r.p, serviceName: r.serviceName, serviceSlug: r.serviceSlug }));
}

export async function getClinicPackage(tx: Tx, tenantId: string, id: string): Promise<ClinicPackageWithService | null> {
  const [r] = await tx
    .select({ p: clinicPackages, serviceName: services.name, serviceSlug: services.slug })
    .from(clinicPackages)
    .leftJoin(services, eq(clinicPackages.serviceId, services.id))
    .where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, id)))
    .limit(1);
  return r ? { ...r.p, serviceName: r.serviceName, serviceSlug: r.serviceSlug } : null;
}

export interface CustomerRef {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Patient record of a storefront customer: linked by customerId, else matched by phone (and linked). */
export async function findPatientForCustomer(tx: Tx, tenantId: string, customer: CustomerRef): Promise<PatientRow | null> {
  const [byId] = await tx.select().from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.customerId, customer.id))).limit(1);
  if (byId) return byId;
  const phone = customer.phone ? normalizeThaiPhone(customer.phone) : null;
  if (!phone) return null;
  const [byPhone] = await tx.select().from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.phone, phone))).limit(1);
  if (!byPhone) return null;
  if (!byPhone.customerId) {
    await tx.update(patients).set({ customerId: customer.id }).where(and(eq(patients.tenantId, tenantId), eq(patients.id, byPhone.id)));
    return { ...byPhone, customerId: customer.id };
  }
  return byPhone;
}

function splitName(name: string | null | undefined): { firstName: string; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "ลูกค้า", lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") || null };
}

export type ConsentRecord = { at: string; version: string; by?: string };

/** Consent keys a storefront customer grants when buying a course (PDPA data processing + treatment terms). */
export const ONLINE_PURCHASE_CONSENTS = ["pdpa", "treatment"] as const;

/** Merges consent records into patients.consents (keeps other keys, overwrites the given ones). */
export async function recordPatientConsents(tx: Tx, tenantId: string, patientId: string, keys: readonly string[], rec: { version: string; by: string; at?: Date }): Promise<Record<string, ConsentRecord>> {
  const [p] = await tx.select({ consents: patients.consents }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId))).limit(1).for("update");
  const consents: Record<string, ConsentRecord> = { ...(p?.consents ?? {}) };
  const at = (rec.at ?? new Date()).toISOString();
  for (const k of keys) consents[k] = { at, version: rec.version, by: rec.by };
  await tx.update(patients).set({ consents }).where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)));
  return consents;
}

/** Finds or creates the patient for a customer; new patients get an HN like "LM-0001". */
export async function ensurePatient(tx: Tx, tenantId: string, customer: CustomerRef, opts: { hnPrefix: string; source?: string }): Promise<PatientRow> {
  const existing = await findPatientForCustomer(tx, tenantId, customer);
  if (existing) return existing;
  const hn = `${opts.hnPrefix}-${pad(await nextCounter(tx, tenantId, "hn", 0), 4)}`;
  const { firstName, lastName } = splitName(customer.name);
  const [row] = await tx
    .insert(patients)
    .values({
      tenantId,
      hn,
      customerId: customer.id,
      firstName,
      lastName,
      phone: customer.phone ? normalizeThaiPhone(customer.phone) ?? customer.phone : null,
      email: customer.email ?? null,
      source: opts.source ?? "online",
    })
    .returning();
  await emitEvent(tx, { tenantId, type: "patient.created", payload: { patientId: row!.id, hn, customerId: customer.id } });
  return row!;
}

export function sessionsLeft(pp: Pick<PatientPackageRow, "sessionsTotal" | "sessionsUsed">): number {
  return Math.max(0, pp.sessionsTotal - pp.sessionsUsed);
}

export interface PatientPackageItem extends PatientPackageRow {
  sessionsLeft: number;
  packageImage: string | null;
  packageDescription: string | null;
  serviceName: string | null;
  serviceId: string | null;
  serviceSlug: string | null;
  /** derived: active but past expiresAt */
  isExpired: boolean;
}

/** Packages owned by the customer's patient record (any status), newest first. */
export async function listPatientPackages(tx: Tx, tenantId: string, customer: CustomerRef, opts: { now?: Date } = {}): Promise<PatientPackageItem[]> {
  const patient = await findPatientForCustomer(tx, tenantId, customer);
  if (!patient) return [];
  const now = opts.now ?? new Date();
  const rows = await tx
    .select({ pp: patientPackages, packageImage: clinicPackages.image, packageDescription: clinicPackages.description, serviceName: services.name, serviceId: services.id, serviceSlug: services.slug })
    .from(patientPackages)
    .innerJoin(clinicPackages, and(eq(patientPackages.packageId, clinicPackages.id), eq(clinicPackages.tenantId, tenantId)))
    .leftJoin(services, and(eq(clinicPackages.serviceId, services.id), eq(services.tenantId, tenantId)))
    .where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.patientId, patient.id)))
    .orderBy(desc(patientPackages.purchasedAt));
  return rows.map((r) => ({
    ...r.pp,
    sessionsLeft: sessionsLeft(r.pp),
    packageImage: r.packageImage,
    packageDescription: r.packageDescription,
    serviceName: r.serviceName,
    serviceId: r.serviceId,
    serviceSlug: r.serviceSlug,
    isExpired: r.pp.status === "active" && !!r.pp.expiresAt && r.pp.expiresAt < now,
  }));
}

export async function getPatientPackageForCustomer(tx: Tx, tenantId: string, id: string, customer: CustomerRef): Promise<(PatientPackageItem & { payment: PaymentRow | null }) | null> {
  const list = await listPatientPackages(tx, tenantId, customer);
  const item = list.find((p) => p.id === id);
  if (!item) return null;
  const pays = await listPaymentsFor(tx, tenantId, "patient_package", item.id);
  const payment = pays.find((p) => p.id === item.paymentId) ?? pays.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return { ...item, payment };
}

const PROVIDER_FOR: Record<PaymentMethod, PaymentProvider> = {
  promptpay_qr: "promptpay",
  slip: "bank_transfer",
  cash: "cash",
  cod: "cod",
  wallet: "wallet",
  card: "opn",
  installment: "opn",
};

export type PurchaseError = "package_not_found" | "invalid_customer" | "consent_required";

export interface PurchaseResult {
  patient: PatientRow;
  patientPackage: PatientPackageRow;
  payment: PaymentRow;
}

/**
 * Buys a clinic package: patient (HN) → patient_packages row (status "pending" until paid) → payment
 * with refType "patient_package". The paid handler activates it and sets the expiry.
 */
export async function purchasePackage(
  tx: Tx,
  tenantId: string,
  input: { packageId: string; customer: CustomerRef; paymentMethod?: PaymentMethod | null; /** SBR-007: the customer ticked the PDPA / terms box (version = clinicConfig.consentVersion) */ consent: { version: string } | null },
  opts: { settings: Record<string, unknown>; hnPrefix: string; now?: Date },
): Promise<Result<PurchaseResult, PurchaseError>> {
  if (!input.consent) return fail("consent_required");
  const pkg = await getClinicPackage(tx, tenantId, input.packageId);
  if (!pkg || !pkg.active) return fail("package_not_found");
  if (!input.customer.id) return fail("invalid_customer");
  const now = opts.now ?? new Date();
  const found = await ensurePatient(tx, tenantId, input.customer, { hnPrefix: opts.hnPrefix });
  const consents = await recordPatientConsents(tx, tenantId, found.id, ONLINE_PURCHASE_CONSENTS, { version: input.consent.version, by: "customer", at: now });
  const patient: PatientRow = { ...found, consents };

  const [pp] = await tx
    .insert(patientPackages)
    .values({
      tenantId,
      patientId: patient.id,
      packageId: pkg.id,
      packageName: pkg.name,
      sessionsTotal: pkg.sessions,
      sessionsUsed: 0,
      pricePaid: pkg.price,
      purchasedAt: now,
      expiresAt: null,
      status: "pending",
    })
    .returning();

  const allowed = enabledMethods(opts.settings);
  const method: PaymentMethod = input.paymentMethod && allowed.includes(input.paymentMethod as (typeof allowed)[number]) ? input.paymentMethod : allowed[0]!;
  const payment = await createPayment(tx, tenantId, {
    refType: "patient_package",
    refId: pp!.id,
    amount: pkg.price,
    provider: PROVIDER_FOR[method],
    method,
    customerId: input.customer.id,
    promptpayId: resolvePromptpayId(opts.settings) ?? undefined,
    expiresMinutes: paymentSettings(opts.settings).expiresMinutes ?? 30,
    metadata: { packageId: pkg.id, packageName: pkg.name, hn: patient.hn },
  });
  const [updated] = await tx.update(patientPackages).set({ paymentId: payment.id }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pp!.id))).returning();
  await emitEvent(tx, { tenantId, type: "patient_package.purchased", payload: { patientPackageId: pp!.id, patientId: patient.id, packageId: pkg.id, amount: pkg.price, paymentId: payment.id } });
  return ok({ patient, patientPackage: updated!, payment });
}

/**
 * registerPaymentHandler("patient_package") – activates the pending package and starts its validity.
 * Idempotent for the package's own payment; money for a cancelled package or a second payment for an already
 * active one is flagged for a refund (payments-api 3.1) instead of being applied.
 */
export async function onPatientPackagePaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, payment.refId))).limit(1).for("update");
  if (!pp) return refundRequired("ไม่พบรายการซื้อคอร์ส");
  if (pp.status === "cancelled") return refundRequired("รายการซื้อคอร์สถูกยกเลิกแล้ว (หมดเวลาชำระ)");
  if (pp.status !== "pending") return pp.paymentId === payment.id ? undefined : refundRequired("ชำระซ้ำ");
  const [pkg] = await tx.select({ validityDays: clinicPackages.validityDays }).from(clinicPackages).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, pp.packageId))).limit(1);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (pkg?.validityDays ?? 365) * 86_400_000);
  await tx.update(patientPackages).set({ status: "active", purchasedAt: now, expiresAt, paymentId: payment.id, pricePaid: payment.amount }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pp.id)));
  await emitEvent(tx, { tenantId, type: "patient_package.activated", payload: { patientPackageId: pp.id, patientId: pp.patientId, packageId: pp.packageId, expiresAt: expiresAt.toISOString() } });
}

/**
 * registerPaymentClosedHandler("patient_package") – the purchase's current payment was voided or expired while
 * the package was still unpaid → the pending package is cancelled (payments-api 3.2). Idempotent; a superseded
 * payment (renewed QR) leaves the package alone.
 */
export async function onPatientPackagePaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, payment.refId))).limit(1).for("update");
  if (!pp || pp.status !== "pending") return;
  if (pp.paymentId && pp.paymentId !== payment.id) return;
  await tx.update(patientPackages).set({ status: "cancelled" }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pp.id)));
  await emitEvent(tx, { tenantId, type: "patient_package.cancelled", payload: { patientPackageId: pp.id, patientId: pp.patientId, packageId: pp.packageId, reason: info.reason, by: "system", paymentStatus: info.status } });
}

/** Re-opens a payment for a pending package whose previous QR expired (voids the old unpaid one first). */
export async function createPackagePayment(tx: Tx, tenantId: string, pp: PatientPackageRow, method: PaymentMethod | null | undefined, customerId: string, settings: Record<string, unknown>): Promise<PaymentRow> {
  const old = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "patient_package"), eq(payments.refId, pp.id), inArray(payments.status, ["pending", "failed"])))
    .for("update");
  for (const o of old) await cancelPayment(tx, tenantId, o.id, "ออก QR ใหม่", { runHandler: false });
  const allowed = enabledMethods(settings);
  const m: PaymentMethod = method && allowed.includes(method as (typeof allowed)[number]) ? method : allowed[0]!;
  const payment = await createPayment(tx, tenantId, {
    refType: "patient_package",
    refId: pp.id,
    amount: pp.pricePaid,
    provider: PROVIDER_FOR[m],
    method: m,
    customerId,
    promptpayId: resolvePromptpayId(settings) ?? undefined,
    expiresMinutes: paymentSettings(settings).expiresMinutes ?? 30,
  });
  await tx.update(patientPackages).set({ paymentId: payment.id }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pp.id)));
  return payment;
}

/** Active packages of a patient that still have sessions (used by the account page summary). */
export async function countActiveSessions(tx: Tx, tenantId: string, customer: CustomerRef): Promise<number> {
  const list = await listPatientPackages(tx, tenantId, customer);
  return list.filter((p) => p.status === "active" && !p.isExpired).reduce((n, p) => n + p.sessionsLeft, 0);
}

export const PATIENT_PACKAGE_ACTIVE_STATUSES = ["active"] as const;

/* ------------------------------------------------------------------ */
/* SBR-016 – redeeming a course session with an online booking          */
/* ------------------------------------------------------------------ */

export interface RedeemablePackage {
  id: string;
  patientId: string;
  packageName: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  serviceId: string | null;
  expiresAt: Date | null;
}

/**
 * The customer's course that can pay for a booking of `serviceId`: owned by the customer's patient record,
 * active, not expired, a session left, and for that service (a course without a service fits any service).
 * Locks the row (FOR UPDATE) so two bookings cannot spend the last session twice. null when not usable.
 */
export async function lockRedeemablePackage(tx: Tx, tenantId: string, patientPackageId: string, opts: { customer: CustomerRef; serviceId: string; now?: Date }): Promise<RedeemablePackage | null> {
  if (!isUuid(patientPackageId) || !opts.customer.id) return null;
  const now = opts.now ?? new Date();
  const patient = await findPatientForCustomer(tx, tenantId, opts.customer);
  if (!patient) return null;
  const [pp] = await tx
    .select()
    .from(patientPackages)
    .where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, patientPackageId), eq(patientPackages.patientId, patient.id)))
    .limit(1)
    .for("update");
  if (!pp || pp.status !== "active") return null;
  if (pp.expiresAt && pp.expiresAt < now) return null;
  if (sessionsLeft(pp) <= 0) return null;
  const [pkg] = await tx.select({ serviceId: clinicPackages.serviceId }).from(clinicPackages).where(and(eq(clinicPackages.tenantId, tenantId), eq(clinicPackages.id, pp.packageId))).limit(1);
  const serviceId = pkg?.serviceId ?? null;
  if (serviceId && serviceId !== opts.serviceId) return null;
  return { id: pp.id, patientId: pp.patientId, packageName: pp.packageName, sessionsTotal: pp.sessionsTotal, sessionsUsed: pp.sessionsUsed, sessionsLeft: sessionsLeft(pp), serviceId, expiresAt: pp.expiresAt };
}

/** Spends one session of a (locked) course for a booking: package_usages row + sessions_used++. */
export async function redeemPackageSession(tx: Tx, tenantId: string, pkg: RedeemablePackage, booking: { id: string; number: string }): Promise<{ usageId: string; sessionsLeft: number }> {
  const [usage] = await tx.insert(packageUsages).values({ tenantId, patientPackageId: pkg.id, visitId: null, note: `จองคิวออนไลน์ ${booking.number}` }).returning({ id: packageUsages.id });
  const used = pkg.sessionsUsed + 1;
  const status = used >= pkg.sessionsTotal ? "exhausted" : "active";
  await tx.update(patientPackages).set({ sessionsUsed: used, status }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pkg.id)));
  await emitEvent(tx, { tenantId, type: "patient_package.used", payload: { patientPackageId: pkg.id, patientId: pkg.patientId, sessionsUsed: used, sessionsTotal: pkg.sessionsTotal, status, bookingId: booking.id, source: "online_booking" } });
  return { usageId: usage!.id, sessionsLeft: Math.max(0, pkg.sessionsTotal - used) };
}

/** Gives the session back when a course booking is cancelled (idempotent: the usage row is deleted once). */
export async function releasePackageSession(tx: Tx, tenantId: string, ref: { patientPackageId?: unknown; packageUsageId?: unknown }, opts: { bookingId: string; now?: Date }): Promise<boolean> {
  const ppId = typeof ref.patientPackageId === "string" ? ref.patientPackageId : null;
  const usageId = typeof ref.packageUsageId === "string" ? ref.packageUsageId : null;
  if (!ppId || !usageId || !isUuid(ppId) || !isUuid(usageId)) return false;
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, ppId))).limit(1).for("update");
  if (!pp) return false;
  const gone = await tx.delete(packageUsages).where(and(eq(packageUsages.tenantId, tenantId), eq(packageUsages.id, usageId), eq(packageUsages.patientPackageId, ppId))).returning({ id: packageUsages.id });
  if (!gone.length) return false;
  const now = opts.now ?? new Date();
  const used = Math.max(0, pp.sessionsUsed - 1);
  const status = pp.status === "exhausted" && used < pp.sessionsTotal ? (pp.expiresAt && pp.expiresAt < now ? "expired" : "active") : pp.status;
  await tx.update(patientPackages).set({ sessionsUsed: used, status }).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, pp.id)));
  await emitEvent(tx, { tenantId, type: "patient_package.session_released", payload: { patientPackageId: pp.id, patientId: pp.patientId, sessionsUsed: used, bookingId: opts.bookingId } });
  return true;
}

/** Course summary shown on a booking that was paid with a session. */
export async function getPackageSummary(tx: Tx, tenantId: string, patientPackageId: string): Promise<{ id: string; packageName: string; sessionsLeft: number; status: string } | null> {
  if (!isUuid(patientPackageId)) return null;
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, patientPackageId))).limit(1);
  return pp ? { id: pp.id, packageName: pp.packageName, sessionsLeft: sessionsLeft(pp), status: pp.status } : null;
}
