import { done, tenantIdOf, tt } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  for (const slug of ["demo-salon", "demo-clinic"]) {
    const t = await tenantIdOf(slug);
    await tt(t, async (tx) => {
      console.log(slug, t);
      console.log(JSON.stringify(rows(await tx.execute(sql`select id, slug, price, deposit_required, deposit_amount, duration_min, capacity, requires_staff, active from services where tenant_id=${t} order by sort limit 12`))));
      console.log(JSON.stringify(rows(await tx.execute(sql`select module, config from tenant_modules where tenant_id=${t} and module='booking'`))));
      console.log(JSON.stringify(rows(await tx.execute(sql`select settings->'payments' p from tenants where id=${t}`))));
      console.log(JSON.stringify(rows(await tx.execute(sql`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname='bookings_no_overlap'`))));
    });
  }
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
