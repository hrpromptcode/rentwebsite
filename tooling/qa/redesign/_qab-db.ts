import "../../load-env";
import { getAdminDb, pages, tenants, bookings, diningTables, restaurantOrders, reservations, clinicPackages, eq, desc, and } from "@rentweb/db";

/** qa-b: read-only — page slugs + real ids for demo-clinic/salon/course/restaurant (crawl inputs). */
const db = getAdminDb();
for (const slug of ["demo-clinic", "demo-salon", "demo-course", "demo-restaurant"]) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!t) continue;
  const ps = await db.select({ slug: pages.slug, status: pages.status }).from(pages).where(eq(pages.tenantId, t.id));
  console.log(`${slug} ${t.id} pages=${ps.map((p) => `${p.slug}:${p.status}`).join(",")}`);
  if (slug === "demo-restaurant") {
    const tb = await db.select({ n: diningTables.name, q: diningTables.qrToken }).from(diningTables).where(eq(diningTables.tenantId, t.id)).limit(3);
    console.log("  tables", JSON.stringify(tb));
    const os = await db.select({ n: restaurantOrders.number, type: restaurantOrders.type, p: restaurantOrders.customerPhone, s: restaurantOrders.status }).from(restaurantOrders).where(eq(restaurantOrders.tenantId, t.id)).orderBy(desc(restaurantOrders.createdAt)).limit(6);
    console.log("  orders", JSON.stringify(os));
    const rs = await db.select({ n: reservations.number, p: reservations.phone, s: reservations.status }).from(reservations).where(eq(reservations.tenantId, t.id)).orderBy(desc(reservations.createdAt)).limit(4);
    console.log("  reservations", JSON.stringify(rs));
  } else {
    const bs = await db.select({ id: bookings.id, n: bookings.number, s: bookings.status, a: bookings.answers }).from(bookings).where(and(eq(bookings.tenantId, t.id))).orderBy(desc(bookings.createdAt)).limit(6);
    console.log("  bookings", JSON.stringify(bs.map((b) => ({ id: b.id, n: b.n, s: b.s, k: (b.a as { accessKey?: string } | null)?.accessKey ?? null }))));
    const pk = await db.select({ id: clinicPackages.id, name: clinicPackages.name }).from(clinicPackages).where(eq(clinicPackages.tenantId, t.id)).limit(4);
    console.log("  packages", JSON.stringify(pk));
  }
}
process.exit(0);
