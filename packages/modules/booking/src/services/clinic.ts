import { and, asc, desc, eq, nextCounter, type Tx } from "@rentweb/db";
import { clinicPackages, patientPackages, patients, payments, services } from "@rentweb/db";
import { emitEvent, fail, ok, pad, type Result } from "@rentweb/core";
import { normalizeThaiPhone } from "@rentweb/core";
import { createPayment, enabledMethods, listPaymentsFor, paymentSettings, resolvePromptpayId, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";

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
    await tx.update(patients).set({ customerId: customer.id }).where(eq(patients.id, byPhone.id));
    return { ...byPhone, customerId: customer.id };
  }
  return byPhone;
}

function splitName(name: string | null | undefined): { firstName: string; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "ลูกค้า", lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") || null };
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
  /** derived: active but past expiresAt */
  isExpired: boolean;
}

/** Packages owned by the customer's patient record (any status), newest first. */
export async function listPatientPackages(tx: Tx, tenantId: string, customer: CustomerRef, opts: { now?: Date } = {}): Promise<PatientPackageItem[]> {
  const patient = await findPatientForCustomer(tx, tenantId, customer);
  if (!patient) return [];
  const now = opts.now ?? new Date();
  const rows = await tx
    .select({ pp: patientPackages, packageImage: clinicPackages.image, packageDescription: clinicPackages.description, serviceName: services.name })
    .from(patientPackages)
    .innerJoin(clinicPackages, eq(patientPackages.packageId, clinicPackages.id))
    .leftJoin(services, eq(clinicPackages.serviceId, services.id))
    .where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.patientId, patient.id)))
    .orderBy(desc(patientPackages.purchasedAt));
  return rows.map((r) => ({
    ...r.pp,
    sessionsLeft: sessionsLeft(r.pp),
    packageImage: r.packageImage,
    packageDescription: r.packageDescription,
    serviceName: r.serviceName,
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

export type PurchaseError = "package_not_found" | "invalid_customer";

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
  input: { packageId: string; customer: CustomerRef; paymentMethod?: PaymentMethod | null },
  opts: { settings: Record<string, unknown>; hnPrefix: string; now?: Date },
): Promise<Result<PurchaseResult, PurchaseError>> {
  const pkg = await getClinicPackage(tx, tenantId, input.packageId);
  if (!pkg || !pkg.active) return fail("package_not_found");
  if (!input.customer.id) return fail("invalid_customer");
  const now = opts.now ?? new Date();
  const patient = await ensurePatient(tx, tenantId, input.customer, { hnPrefix: opts.hnPrefix });

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
  const [updated] = await tx.update(patientPackages).set({ paymentId: payment.id }).where(eq(patientPackages.id, pp!.id)).returning();
  await emitEvent(tx, { tenantId, type: "patient_package.purchased", payload: { patientPackageId: pp!.id, patientId: patient.id, packageId: pkg.id, amount: pkg.price, paymentId: payment.id } });
  return ok({ patient, patientPackage: updated!, payment });
}

/** registerPaymentHandler("patient_package") – activates the package and starts its validity. Idempotent. */
export async function onPatientPackagePaid(tx: Tx, payment: PaymentRow): Promise<void> {
  const [pp] = await tx.select().from(patientPackages).where(and(eq(patientPackages.tenantId, payment.tenantId), eq(patientPackages.id, payment.refId))).limit(1);
  if (!pp || pp.status !== "pending") return;
  const [pkg] = await tx.select({ validityDays: clinicPackages.validityDays }).from(clinicPackages).where(eq(clinicPackages.id, pp.packageId)).limit(1);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (pkg?.validityDays ?? 365) * 86_400_000);
  await tx.update(patientPackages).set({ status: "active", purchasedAt: now, expiresAt, paymentId: payment.id, pricePaid: payment.amount }).where(eq(patientPackages.id, pp.id));
  await emitEvent(tx, { tenantId: payment.tenantId, type: "patient_package.activated", payload: { patientPackageId: pp.id, patientId: pp.patientId, packageId: pp.packageId, expiresAt: expiresAt.toISOString() } });
}

/** Re-opens a payment for a pending package whose previous QR expired. */
export async function createPackagePayment(tx: Tx, tenantId: string, pp: PatientPackageRow, method: PaymentMethod | null | undefined, customerId: string, settings: Record<string, unknown>): Promise<PaymentRow> {
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
  await tx.update(patientPackages).set({ paymentId: payment.id }).where(eq(patientPackages.id, pp.id));
  return payment;
}

/** Active packages of a patient that still have sessions (used by the account page summary). */
export async function countActiveSessions(tx: Tx, tenantId: string, customer: CustomerRef): Promise<number> {
  const list = await listPatientPackages(tx, tenantId, customer);
  return list.filter((p) => p.status === "active" && !p.isExpired).reduce((n, p) => n + p.sessionsLeft, 0);
}

export const PATIENT_PACKAGE_ACTIVE_STATUSES = ["active"] as const;
