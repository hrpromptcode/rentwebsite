import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { rentalExtras, rentalRateRules, rentalUnitTypes, tenants, withTenant, type Tx } from "@rentweb/db";
import type { RentalConfig } from "../src/services/config";

export const CONFIG: RentalConfig = {
  checkInTime: "14:00",
  checkOutTime: "12:00",
  freeCancelDays: 7,
  depositPercent: 30,
  allowFullPayment: true,
  allowPayAtProperty: false,
  maxAdvanceDays: 365,
  maxNights: 30,
  holdMinutes: 30,
};

export const SETTINGS = {
  contact: { phone: "076-000-111" },
  payments: { promptpayId: "0891112222", promptpayName: "ทดสอบ", bankAccounts: [{ bank: "กสิกรไทย", name: "ทดสอบ", number: "123-4-56789-0" }], enabled: { promptpay: true, bankTransfer: true, cash: true }, autoApproveSlips: true },
};

/** Thursday 2026-10-15 09:00 Bangkok. */
export const NOW = new Date("2026-10-15T02:00:00.000Z");
export const TODAY = "2026-10-15";

export interface Seeded {
  db: TestDb;
  tenantId: string;
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  types: { deluxe: string; villa: string };
  extras: { breakfast: string; pickup: string; lateOut: string };
  guest: (n: number) => { name: string; phone: string; email?: string };
}

/**
 * Mini resort: Deluxe (3 units, ฿3,000, 2 guests incl., +฿800/extra guest, max 3) and Beach Villa (1 unit, ฿12,000, min 2
 * nights, 4 guests incl., max 6). Rules: high season Nov–Feb +25% (all), weekends Fri/Sat +10% (all), villa Christmas week fixed ฿18,000.
 */
export async function seedResort(): Promise<Seeded> {
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: "demo-test-hotel", name: "Test Resort", siteType: "hotel" }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);
  const seeded = await tx(async (tx) => {
    const types = await tx
      .insert(rentalUnitTypes)
      .values([
        { tenantId, name: "ดีลักซ์", slug: "deluxe", quantity: 3, basePrice: 300000, baseGuests: 2, maxGuests: 3, extraGuestPrice: 80000, minNights: 1, sort: 0 },
        { tenantId, name: "บีชวิลล่า", slug: "villa", quantity: 1, basePrice: 1200000, baseGuests: 4, maxGuests: 6, extraGuestPrice: 150000, minNights: 2, sort: 1 },
      ])
      .returning({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug });
    const villa = types.find((x) => x.slug === "villa")!.id;
    const deluxe = types.find((x) => x.slug === "deluxe")!.id;
    await tx.insert(rentalRateRules).values([
      { tenantId, unitTypeId: null, name: "ไฮซีซัน", startDate: "2026-11-01", endDate: "2027-02-28", weekdays: null, mode: "percent", value: 25, priority: 10 },
      { tenantId, unitTypeId: null, name: "สุดสัปดาห์", startDate: null, endDate: null, weekdays: [5, 6], mode: "percent", value: 10, priority: 20 },
      { tenantId, unitTypeId: villa, name: "คริสต์มาส", startDate: "2026-12-24", endDate: "2026-12-26", weekdays: null, mode: "price", value: 1800000, priority: 30 },
    ]);
    const ex = await tx
      .insert(rentalExtras)
      .values([
        { tenantId, name: "อาหารเช้า", price: 35000, pricing: "per_guest_night", sort: 0 },
        { tenantId, name: "รถรับส่งสนามบิน", price: 180000, pricing: "per_stay", sort: 1 },
        { tenantId, name: "เช็กเอาต์ช้า", price: 80000, pricing: "per_stay", sort: 2 },
      ])
      .returning({ id: rentalExtras.id, name: rentalExtras.name });
    return { types: { deluxe, villa }, extras: { breakfast: ex[0]!.id, pickup: ex[1]!.id, lateOut: ex[2]!.id } };
  });
  return { db, tenantId, tx, ...seeded, guest: (n) => ({ name: `ผู้เข้าพัก ${n}`, phone: `08900000${String(n).padStart(2, "0")}`, email: `g${n}@example.com` }) };
}
