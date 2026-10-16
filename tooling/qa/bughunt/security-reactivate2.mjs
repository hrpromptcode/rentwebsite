import { ADMIN, actionId, callAction, creds, db } from "./security-http.mjs";
const c = creds(); const sql = db();
await sql`update tenants set trial_ends_at = now() - interval '3 days', status = 'past_due' where slug = 'sec-u1shop'`;
console.log("setup (expired trial, superadmin-equivalent past_due):", await sql`select status, trial_ends_at from tenants where slug='sec-u1shop'`);
await callAction(ADMIN, c.u1.cookie, actionId("suspendOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
console.log("after owner suspend:", (await sql`select status from tenants where slug='sec-u1shop'`)[0]);
await callAction(ADMIN, c.u1.cookie, actionId("reactivateOwnTenant", "settings"), ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
console.log("after owner reactivate:", (await sql`select status from tenants where slug='sec-u1shop'`)[0]);
process.exit(0);
