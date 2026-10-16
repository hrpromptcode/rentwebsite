import { beforeAll, describe, expect, it } from "vitest";
import { customers, eq, patients } from "@rentweb/db";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import { findPatientForCustomer, listPatientPackages, onPatientPackagePaid, purchasePackage } from "../src/services/clinic";
import { NOW, seedSalon, SETTINGS, type Seeded } from "./helpers";

let s: Seeded;
let customerId: string;

beforeAll(async () => {
  s = await seedSalon();
  registerPaymentHandler("patient_package", onPatientPackagePaid);
  const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, name: "สมหญิง ใจดี", phone: "0899999999" }).returning({ id: customers.id }));
  customerId = c!.id;
});

describe("clinic packages", () => {
  let ppId: string;
  let paymentId: string;

  it("purchasePackage creates the patient with an HN, a pending package and a payment", async () => {
    const r = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: { id: customerId, name: "สมหญิง ใจดี", phone: "0899999999" }, paymentMethod: "slip", consent: { version: "1.0" } }, { settings: SETTINGS, hnPrefix: "LM", now: NOW }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.patient.hn).toBe("LM-0001");
    expect(r.value.patient.firstName).toBe("สมหญิง");
    expect(r.value.patient.lastName).toBe("ใจดี");
    expect(r.value.patient.customerId).toBe(customerId);
    expect(r.value.patientPackage.status).toBe("pending");
    expect(r.value.patientPackage.sessionsTotal).toBe(5);
    expect(r.value.patientPackage.paymentId).toBe(r.value.payment.id);
    expect(r.value.payment.refType).toBe("patient_package");
    expect(r.value.payment.amount).toBe(250000);
    ppId = r.value.patientPackage.id;
    paymentId = r.value.payment.id;
    const list = await s.tx((tx) => listPatientPackages(tx, s.tenantId, { id: customerId }));
    expect(list).toHaveLength(1);
    expect(list[0]!.sessionsLeft).toBe(5);
  });

  it("paying activates the package and sets the expiry; paying twice is harmless; second purchase reuses the patient", async () => {
    await s.tx((tx) => markPaid(tx, s.tenantId, paymentId, { verifiedBy: "test" }));
    const [pp] = await s.tx((tx) => listPatientPackages(tx, s.tenantId, { id: customerId }));
    expect(pp!.status).toBe("active");
    expect(pp!.expiresAt).toBeInstanceOf(Date);
    const days = Math.round((pp!.expiresAt!.getTime() - pp!.purchasedAt.getTime()) / 86_400_000);
    expect(days).toBe(180);
    await s.tx((tx) => markPaid(tx, s.tenantId, paymentId));
    const [again] = await s.tx((tx) => listPatientPackages(tx, s.tenantId, { id: customerId }));
    expect(again!.expiresAt?.getTime()).toBe(pp!.expiresAt?.getTime());

    const r2 = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: { id: customerId, name: "สมหญิง ใจดี", phone: "0899999999" }, consent: { version: "1.0" } }, { settings: SETTINGS, hnPrefix: "LM", now: NOW }));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.patient.hn).toBe("LM-0001");
    const all = await s.tx((tx) => tx.select().from(patients).where(eq(patients.tenantId, s.tenantId)));
    expect(all).toHaveLength(1);
    expect(ppId).toBeTruthy();
  });

  it("matches an existing patient record by phone and links the customer", async () => {
    await s.tx((tx) => tx.insert(patients).values({ tenantId: s.tenantId, hn: "LM-0099", firstName: "วอล์กอิน", phone: "0877777777" }));
    const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, name: "วอล์กอิน", phone: "087-777-7777" }).returning({ id: customers.id }));
    const p = await s.tx((tx) => findPatientForCustomer(tx, s.tenantId, { id: c!.id, phone: "087-777-7777" }));
    expect(p?.hn).toBe("LM-0099");
    expect(p?.customerId).toBe(c!.id);
  });
});
