import { ADMIN, actionId, creds } from "./security-http.mjs";
const c = creds();
// server action with a foreign Origin header -> Next should reject
const r = await fetch(`${ADMIN}/console`, { method: "POST", redirect: "manual", headers: { "next-action": actionId("updateTenantStatus","console"), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: "https://evil.example", cookie: c.admin.cookie }, body: JSON.stringify([{ tenantId: "01a144bc-d03e-718b-87cc-302c99cbd1ee", status: "suspended" }]) });
console.log("foreign-origin server action:", r.status, (await r.text()).slice(0,120).replace(/\n/g," "));
process.exit(0);
