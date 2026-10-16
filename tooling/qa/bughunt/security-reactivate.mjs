import { ADMIN, actionId, callAction, creds } from "./security-http.mjs";
import { db } from "./security-http.mjs";
const c = creds();
const sql = db(); const q = async (s) => JSON.stringify(await sql.unsafe(s));
const row = JSON.parse(await q("select id, status from tenants where slug='sec-u1shop'"))[0];
console.log("before", row);
for (const status of ["suspended", "past_due", "cancelled"]) {
  const r = await callAction(ADMIN, c.admin.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: row.id, status }], `/console/tenants/${row.id}`);
  console.log(`superadmin -> ${status}:`, r.status, await q("select status from tenants where slug='sec-u1shop'"));
  if (status === "past_due") {
    const s = await callAction(ADMIN, c.u1.cookie, actionId("suspendOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
    console.log("  owner suspendOwnTenant:", s.status, await q("select status from tenants where slug='sec-u1shop'"));
  }
  const o = await callAction(ADMIN, c.u1.cookie, actionId("reactivateOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
  console.log("  owner reactivateOwnTenant:", o.status, o.text.match(/"ok":(true|false)[^}]*/)?.[0], await q("select status from tenants where slug='sec-u1shop'"));
}
console.log("audit:", await q("select action, actor_type, diff from audit_logs where tenant_id=(select id from tenants where slug='sec-u1shop') order by created_at desc limit 6"));
process.exit(0);
