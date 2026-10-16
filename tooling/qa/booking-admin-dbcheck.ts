import "../load-env";
import { eq, getAdminDb, tenants, withTenant } from "@rentweb/db";
import { getBusinessHours, listServicesAdmin, listStaffAdmin, listTimeOff, listCategoriesAdmin, listPatients, listPackagesAdmin, listVisits, listBookingsForVisits, visitKpis, searchCustomers } from "../../packages/modules/booking/src/admin/index";

/** Calls the admin queries directly to surface SQL errors:  pnpm --filter @rentweb/tooling exec tsx qa/booking-admin-dbcheck.ts */
async function main() {
  const db = getAdminDb();
  for (const slug of ["demo-salon", "demo-clinic"]) {
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    const id = t!.id;
    const day = new Date(Date.now() - 86_400_000 * 3);
    const end = new Date(Date.now() + 86_400_000 * 3);
    const run = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const r = await fn();
        console.log(`ok   ${slug} ${name}`, Array.isArray(r) ? `rows=${r.length}` : JSON.stringify(r).slice(0, 160));
      } catch (e) {
        console.log(`FAIL ${slug} ${name}:`, (e as Error).message.slice(0, 400), (e as { cause?: Error }).cause?.message?.slice(0, 300) ?? "");
      }
    };
    await withTenant(db, id, async (tx) => {
      await run("listStaffAdmin", () => listStaffAdmin(tx, id, { dayStart: day, dayEnd: end }));
      await run("listServicesAdmin", () => listServicesAdmin(tx, id));
      await run("listCategoriesAdmin", () => listCategoriesAdmin(tx, id));
      await run("getBusinessHours", () => getBusinessHours(tx, id));
      await run("listTimeOff", () => listTimeOff(tx, id, { staffId: null }));
      await run("searchCustomers", () => searchCustomers(tx, id, "08"));
      if (slug === "demo-clinic") {
        await run("listPatients", () => listPatients(tx, id, {}));
        await run("listPackagesAdmin", () => listPackagesAdmin(tx, id));
        await run("listVisits", () => listVisits(tx, id, { from: day, to: end }));
        await run("listBookingsForVisits", () => listBookingsForVisits(tx, id, { from: day, to: end }));
        await run("visitKpis", () => visitKpis(tx, id, day, end));
      }
    });
  }
  process.exit(0);
}
main();
