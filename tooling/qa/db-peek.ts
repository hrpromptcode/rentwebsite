import "../load-env";
import { bookings, clinicPackages, desc, eq, getDb, patientPackages, payments, services, sql, staff, tenants, withPlatform } from "@rentweb/db";

/**
 * Read-only DB peek used by the booking QA: recent bookings/payments/packages across the demo tenants,
 * duplicate staff+slot check and presence of the bookings_no_overlap exclusion constraint.
 *   pnpm --filter @rentweb/tooling exec tsx qa/db-peek.ts
 */
async function main() {
  const db = getDb();
  await withPlatform(db, async (tx) => {
    const rows = await tx
      .select({ tenant: tenants.slug, number: bookings.number, status: bookings.status, pay: bookings.paymentStatus, deposit: bookings.depositAmount, staff: staff.name, service: services.slug, startsAt: bookings.startsAt, created: bookings.createdAt, from: bookings.rescheduledFromId })
      .from(bookings)
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .leftJoin(staff, eq(staff.id, bookings.staffId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .orderBy(desc(bookings.createdAt))
      .limit(14);
    console.log("--- recent bookings ---");
    for (const r of rows) console.log(`${r.tenant.padEnd(12)} ${r.number} ${r.status.padEnd(10)} ${r.pay.padEnd(12)} dep=${r.deposit} ${String(r.staff).padEnd(18)} ${r.service.padEnd(10)} ${r.startsAt.toISOString()} resched=${r.from ? "yes" : "no"}`);

    const dupRaw = await tx.execute(sql`select ${bookings.staffId} as staff_id, ${bookings.startsAt} as starts_at, count(*)::int as n, string_agg(${bookings.number}, ',') as numbers from ${bookings} where ${bookings.status} not in ('cancelled','no_show') and ${bookings.staffId} is not null group by 1,2 having count(*) > 1`);
    const dups = Array.isArray(dupRaw) ? dupRaw : (dupRaw as { rows: unknown[] }).rows;
    console.log("--- duplicate staff+slot (active) ---");
    console.log(dups.length ? dups : "none");

    const conRaw = await tx.execute(sql`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conname = 'bookings_no_overlap'`);
    const con = Array.isArray(conRaw) ? conRaw : (conRaw as { rows: unknown[] }).rows;
    console.log("--- bookings_no_overlap constraint ---");
    console.log(con.length ? con : "MISSING");
    const extRaw = await tx.execute(sql`select extname from pg_extension where extname = 'btree_gist'`);
    const ext = Array.isArray(extRaw) ? extRaw : (extRaw as { rows: unknown[] }).rows;
    console.log("btree_gist extension:", ext.length ? "present" : "MISSING");

    const pays = await tx
      .select({ tenant: tenants.slug, refType: payments.refType, refId: payments.refId, status: payments.status, amount: payments.amount, method: payments.method, paidAt: payments.paidAt, slip: payments.slipUrl })
      .from(payments)
      .innerJoin(tenants, eq(tenants.id, payments.tenantId))
      .orderBy(desc(payments.createdAt))
      .limit(8);
    console.log("--- recent payments ---");
    for (const p of pays) console.log(`${p.tenant.padEnd(12)} ${p.refType.padEnd(16)} ${p.refId.slice(0, 8)} ${p.status.padEnd(8)} ${p.amount} ${p.method} paidAt=${p.paidAt?.toISOString() ?? "-"} slip=${p.slip ? "yes" : "no"}`);

    const ordRaw = await tx.execute(sql`select number, status, payment_status, created_at from orders order by created_at desc limit 3`);
    const ords = Array.isArray(ordRaw) ? ordRaw : (ordRaw as { rows: unknown[] }).rows;
    console.log("--- recent commerce orders (handler scope check) ---");
    console.log(ords);

    const pps = await tx
      .select({ id: patientPackages.id, status: patientPackages.status, total: patientPackages.sessionsTotal, used: patientPackages.sessionsUsed, expires: patientPackages.expiresAt, paymentId: patientPackages.paymentId, name: clinicPackages.name })
      .from(patientPackages)
      .innerJoin(clinicPackages, eq(clinicPackages.id, patientPackages.packageId))
      .orderBy(desc(patientPackages.createdAt))
      .limit(5);
    console.log("--- recent patient packages ---");
    for (const p of pps) console.log(`${p.id.slice(0, 8)} ${p.status.padEnd(8)} ${p.used}/${p.total} expires=${p.expires?.toISOString() ?? "-"} payment=${p.paymentId?.slice(0, 8) ?? "-"} ${p.name}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
