import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log(JSON.stringify(rows(await tx.execute(sql`select conrelid::regclass t, conname, pg_get_constraintdef(oid) d from pg_constraint where contype in ('x','c') and conrelid::regclass::text in ('bookings','products','product_variants','discounts','payments','reservations','table_sessions','patient_packages')`)), null, 1));
    console.log(JSON.stringify(rows(await tx.execute(sql`select indexname, indexdef from pg_indexes where tablename in ('payments','table_sessions','cart_items') `)), null, 1));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
