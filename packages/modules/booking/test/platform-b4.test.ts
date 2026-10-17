import { beforeAll, describe, expect, it } from "vitest";
import { and, customers, eq, patientPackages, payments } from "@rentweb/db";
import { bookingDepositMethods, createBooking } from "../src/services/bookings";
import { packagePaymentMethods, purchasePackage } from "../src/services/clinic";
import { at, CONFIG, DAY, NOW, SETTINGS, seedSalon, type Seeded } from "./helpers";

let s: Seeded;
/** a brand-new salon: PromptPay / bank transfer switched on but no PromptPay ID or account (ADMIN_B2-04) */
const NO_RECEIVER = { contact: { phone: "02-123-4567" }, payments: { enabled: { promptpay: true, bankTransfer: true } } };
const BLOCKED_PHONE = "0899990004";
const BLOCKED_EMAIL = "blocked.b4@example.com";
let blockedId = "";

beforeAll(async () => {
  s = await seedSalon();
  const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, phone: BLOCKED_PHONE, email: BLOCKED_EMAIL, name: "ลูกค้าถูกบล็อก", blockedAt: new Date() }).returning({ id: customers.id }));
  blockedId = c!.id;
});

describe("deposits never ask for an impossible payment (ADMIN_B2-04)", () => {
  it("only methods with a receiver are deposit methods", () => {
    expect(bookingDepositMethods(NO_RECEIVER)).toEqual([]);
    expect(bookingDepositMethods({ payments: { bankAccounts: [{ bank: "กสิกรไทย", name: "ร้าน", number: " " }] } })).toEqual([]);
    expect(bookingDepositMethods({ payments: { enabled: { cash: true } } })).toEqual(["cash"]);
    expect(bookingDepositMethods(SETTINGS)).toEqual(["promptpay_qr", "slip"]);
    expect(packagePaymentMethods(NO_RECEIVER)).toEqual([]);
  });

  it("a deposit service is booked without a deposit (pay at shop) when the shop has no receiver", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.mali, start: at(DAY, "10:00"), customer: { name: "ลูกค้าใหม่", phone: "0811111111" } }, { config: CONFIG, settings: NO_RECEIVER, now: NOW }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.payment).toBeNull();
    expect(r.value.booking.depositAmount).toBe(0);
    expect(r.value.booking.status).toBe("confirmed");
    expect(r.value.booking.answers).toMatchObject({ payAtShop: true, depositWaivedReason: "no_payment_receiver" });
    const pays = await s.tx((tx) => tx.select().from(payments).where(and(eq(payments.tenantId, s.tenantId), eq(payments.refId, r.value.booking.id))));
    expect(pays).toHaveLength(0);
  });

  it("with a receiver the deposit is still taken", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at(DAY, "10:00"), customer: { name: "ลูกค้าใหม่", phone: "0811111112" } }, { config: CONFIG, settings: SETTINGS, now: NOW }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booking.status).toBe("pending");
    expect(r.value.booking.depositAmount).toBe(30000);
    expect(r.value.payment?.method).toBe("promptpay_qr");
    expect((r.value.booking.answers as { payAtShop?: boolean }).payAtShop).toBeUndefined();
  });

  it("a clinic package cannot be bought online without a receiver (nothing is written)", async () => {
    const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, phone: "0822222222", name: "คนไข้" }).returning({ id: customers.id }));
    const r = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: { id: c!.id, name: "คนไข้", phone: "0822222222" }, paymentMethod: "slip", consent: { version: "1.0" } }, { settings: NO_RECEIVER, hnPrefix: "HN", now: NOW }));
    expect(r).toMatchObject({ ok: false, error: "payments_unavailable" });
    const rows = await s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.tenantId, s.tenantId)));
    expect(rows).toHaveLength(0);
  });
});

describe("blocked customers cannot book (ADMIN_B2-13)", () => {
  const book = (customer: { id?: string | null; name: string; phone: string; email?: string | null }, staffId: string, hm: string) =>
    s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId, start: at(DAY, hm), customer }, { config: CONFIG, settings: SETTINGS, now: NOW }));

  it("guest with the blocked customer's phone (any format) is refused", async () => {
    expect(await book({ name: "x", phone: "089-999-0004" }, s.staff.mali, "14:00")).toMatchObject({ ok: false, error: "customer_blocked" });
  });
  it("guest with another phone but the blocked customer's e-mail is refused", async () => {
    expect(await book({ name: "x", phone: "0833333333", email: BLOCKED_EMAIL.toUpperCase() }, s.staff.mali, "14:00")).toMatchObject({ ok: false, error: "customer_blocked" });
  });
  it("signed-in blocked customer id is refused", async () => {
    expect(await book({ id: blockedId, name: "x", phone: "0844444444" }, s.staff.mali, "14:00")).toMatchObject({ ok: false, error: "customer_blocked" });
  });
  it("purchasePackage refuses a blocked customer", async () => {
    const r = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: { id: blockedId, name: "x", phone: BLOCKED_PHONE }, paymentMethod: "slip", consent: { version: "1.0" } }, { settings: SETTINGS, hnPrefix: "HN", now: NOW }));
    expect(r).toMatchObject({ ok: false, error: "customer_blocked" });
  });
  it("other customers still book", async () => {
    expect((await book({ name: "y", phone: "0855555555" }, s.staff.mali, "14:00")).ok).toBe(true);
  });
});
