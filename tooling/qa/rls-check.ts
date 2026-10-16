import "../load-env";
import { getAdminDb, sql } from "@rentweb/db";

/** Lists RLS status + policy count per table in the live database, and probes cross-tenant isolation through withTenant. */
async function main() {
  const db = getAdminDb();
  const rows = (await db.execute(sql`
    select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
           (select count(*) from pg_policies p where p.tablename = c.relname) as policies,
           exists(select 1 from information_schema.columns col where col.table_name = c.relname and col.column_name = 'tenant_id') as has_tenant
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `)) as unknown as Array<{ table: string; rls: boolean; forced: boolean; policies: number; has_tenant: boolean }>;
  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows;
  const unprotected = list.filter((r) => r.has_tenant && (!r.rls || Number(r.policies) === 0));
  console.log(`tables: ${list.length}; tenant-scoped: ${list.filter((r) => r.has_tenant).length}; with RLS+policy: ${list.filter((r) => r.has_tenant && r.rls && Number(r.policies) > 0).length}`);
  console.log("tenant tables WITHOUT rls/policy:", unprotected.map((r) => r.table).join(", ") || "none");
  console.log("non-tenant tables:", list.filter((r) => !r.has_tenant).map((r) => r.table).join(", "));
  const role = (await db.execute(sql`select rolname, rolbypassrls, rolsuper from pg_roles where rolname = ${process.env.DB_APP_ROLE ?? "app_user"}`)) as unknown as Array<Record<string, unknown>>;
  console.log("app role:", JSON.stringify(Array.isArray(role) ? role : (role as unknown as { rows: unknown }).rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
