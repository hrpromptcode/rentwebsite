import { ADMIN, actionId, callAction, creds } from "./security-http.mjs";
import { db } from "./security-http.mjs";
const c = creds();
const sql = db(); const q = async (s) => JSON.stringify(await sql.unsafe(s));
const row = JSON.parse(await q("select id, status, trial_ends_at from tenants where slug='sec-u1shop'"))[0];
let bad = 0; // reverify-repro 2026-10-17: explicit verdict + restore the throwaway tenant afterwards
console.log("before", row);
for (const status of ["suspended", "past_due", "cancelled"]) {
  const r = await callAction(ADMIN, c.admin.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: row.id, status }], `/console/tenants/${row.id}`);
  console.log(`superadmin -> ${status}:`, r.status, await q("select status from tenants where slug='sec-u1shop'"));
  if (status === "past_due") {
    const s = await callAction(ADMIN, c.u1.cookie, actionId("suspendOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
    console.log("  owner suspendOwnTenant:", s.status, await q("select status from tenants where slug='sec-u1shop'"));
  }
  const o = await callAction(ADMIN, c.u1.cookie, actionId("reactivateOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
  const after = JSON.parse(await q("select status from tenants where slug='sec-u1shop'"))[0].status;
  console.log("  owner reactivateOwnTenant:", o.status, o.text.match(/"ok":(true|false)[^}]*/)?.[0], after);
  if (after === "active" || after === "trialing") bad++;
  console.log(after === status ? `PASS SEC-002 owner cannot lift platform status ${status}` : `FAIL SEC-002 owner turned ${status} into ${after}`);
}
console.log("audit:", await q("select action, actor_type, diff from audit_logs where tenant_id=(select id from tenants where slug='sec-u1shop') order by created_at desc limit 6"));
console.log(bad ? "FAIL SEC-002 bug reproduces" : "PASS SEC-002 no platform status lifted by the owner");
await callAction(ADMIN, c.admin.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: row.id, status: row.status }], `/console/tenants/${row.id}`); // invalidates caches
await sql`update tenants set status = ${row.status}, trial_ends_at = ${row.trial_ends_at} where id = ${row.id}`;
console.log("restored", await q("select status, trial_ends_at from tenants where slug='sec-u1shop'"));
process.exit(0);
