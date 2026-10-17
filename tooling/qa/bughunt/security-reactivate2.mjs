import { ADMIN, actionId, callAction, creds, db } from "./security-http.mjs";
const c = creds(); const sql = db();
const [orig] = await sql`select id, status, trial_ends_at from tenants where slug='sec-u1shop'`; // reverify-repro: restored at the end
await sql`update tenants set trial_ends_at = now() - interval '3 days', status = 'past_due' where slug = 'sec-u1shop'`;
console.log("setup (expired trial, superadmin-equivalent past_due):", await sql`select status, trial_ends_at from tenants where slug='sec-u1shop'`);
await callAction(ADMIN, c.u1.cookie, actionId("suspendOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
console.log("after owner suspend:", (await sql`select status from tenants where slug='sec-u1shop'`)[0]);
await callAction(ADMIN, c.u1.cookie, actionId("reactivateOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
const fin = (await sql`select status from tenants where slug='sec-u1shop'`)[0];
console.log("after owner reactivate:", fin);
console.log(fin.status === "active" || fin.status === "trialing" ? "FAIL SEC-002 owner turned past_due (expired trial) into " + fin.status : "PASS SEC-002 past_due tenant stays " + fin.status + " after owner suspend+reactivate");
await callAction(ADMIN, c.admin.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: orig.id, status: orig.status }], `/console/tenants/${orig.id}`); // invalidates caches
await sql`update tenants set status = ${orig.status}, trial_ends_at = ${orig.trial_ends_at} where slug='sec-u1shop'`;
console.log("restored", (await sql`select status, trial_ends_at from tenants where slug='sec-u1shop'`)[0]);
process.exit(0);
