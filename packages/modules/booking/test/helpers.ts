import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { availabilityRules, clinicPackages, serviceCategories, services, staff, staffServices, tenants, withTenant, type Tx } from "@rentweb/db";
import type { BookingConfig } from "../src/services/config";
import { bkkTime, parseYmd } from "../src/services/time";

export const CONFIG: BookingConfig = { slotMinutes: 30, minNoticeHours: 1, maxAdvanceDays: 30, cancelHours: 12, depositEnabled: true, reminderHours: [24, 2] };

export const SETTINGS = {
  contact: { phone: "089-111-2222" },
  payments: { promptpayId: "0891112222", promptpayName: "ทดสอบ", bankAccounts: [{ bank: "ไทยพาณิชย์", name: "ทดสอบ", number: "987-6-54321-0" }], enabled: { promptpay: true, bankTransfer: true }, autoApproveSlips: true },
};

/** Thursday 2026-10-15 09:00 Bangkok. */
export const NOW = new Date("2026-10-15T02:00:00.000Z");
/** Friday – every seeded staff works. */
export const DAY = "2026-10-16";

/** ISO instant of HH:MM Bangkok on a YYYY-MM-DD date. */
export function at(date: string, hm: string): string {
  const ymd = parseYmd(date)!;
  const [h, m] = hm.split(":").map(Number);
  return bkkTime(ymd, h!, m!).toISOString();
}

export interface Seeded {
  db: TestDb;
  tenantId: string;
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  services: { thai60: string; aroma90: string; couple: string; consult: string };
  staff: { ann: string; mali: string; nam: string };
  packageId: string;
}

/**
 * Mini salon: business hours 10:00–22:00 every day. Ann has her own schedule (13:00–22:00, off on
 * Sunday), Mali and Nam fall back to business hours. Everyone performs every service.
 */
export async function seedSalon(): Promise<Seeded> {
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: "demo-test-salon", name: "Test Salon", siteType: "salon" }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

  const seeded = await tx(async (tx) => {
    const [cat] = await tx.insert(serviceCategories).values({ tenantId, name: "นวด", slug: "massage" }).returning({ id: serviceCategories.id });
    const svc = await tx
      .insert(services)
      .values([
        { tenantId, categoryId: cat!.id, name: "นวดไทย 60", slug: "thai-60", durationMin: 60, bufferAfterMin: 15, price: 59000, featured: true, sort: 0 },
        { tenantId, categoryId: cat!.id, name: "อโรมา 90", slug: "aroma-90", durationMin: 90, bufferAfterMin: 15, price: 129000, depositRequired: true, depositAmount: 30000, sort: 1 },
        { tenantId, categoryId: cat!.id, name: "คู่รัก 120", slug: "couple", durationMin: 120, price: 299000, capacity: 2, sort: 2 },
        { tenantId, categoryId: cat!.id, name: "ปรึกษา", slug: "consult", durationMin: 30, price: 0, sort: 3 },
      ])
      .returning({ id: services.id, slug: services.slug });
    const team = await tx
      .insert(staff)
      .values([
        { tenantId, name: "แอน", slug: "ann", sort: 0 },
        { tenantId, name: "มะลิ", slug: "mali", sort: 1 },
        { tenantId, name: "น้ำ", slug: "nam", sort: 2 },
      ])
      .returning({ id: staff.id, slug: staff.slug });
    await tx.insert(staffServices).values(team.flatMap((s) => svc.map((v) => ({ tenantId, staffId: s.id, serviceId: v.id }))));
    const rules: Array<typeof availabilityRules.$inferInsert> = [];
    for (let d = 0; d <= 6; d++) rules.push({ tenantId, staffId: null, weekday: d, startTime: "10:00", endTime: "22:00" });
    const ann = team.find((s) => s.slug === "ann")!.id;
    for (let d = 1; d <= 6; d++) rules.push({ tenantId, staffId: ann, weekday: d, startTime: "13:00", endTime: "22:00" });
    await tx.insert(availabilityRules).values(rules);
    const [pkg] = await tx
      .insert(clinicPackages)
      .values({ tenantId, name: "คอร์ส 5 ครั้ง", serviceId: svc.find((s) => s.slug === "thai-60")!.id, sessions: 5, price: 250000, validityDays: 180 })
      .returning({ id: clinicPackages.id });
    const by = (slug: string) => svc.find((s) => s.slug === slug)!.id;
    return {
      services: { thai60: by("thai-60"), aroma90: by("aroma-90"), couple: by("couple"), consult: by("consult") },
      staff: { ann, mali: team.find((s) => s.slug === "mali")!.id, nam: team.find((s) => s.slug === "nam")!.id },
      packageId: pkg!.id,
    };
  });
  return { db, tenantId, tx, ...seeded };
}
