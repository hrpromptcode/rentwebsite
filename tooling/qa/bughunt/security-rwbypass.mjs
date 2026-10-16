import { db } from "./security-http.mjs";
const sql = db();
const [t] = await sql`select id from tenants where slug='sec-a'`;
await sql`update tenants set status='suspended' where id=${t.id}`;
const { execSync } = await import("node:child_process");
// tenant runtime cache may hold status; host request goes through proxy -> resolveTenantByHost
await new Promise((r) => setTimeout(r, 1500));
const viaHost = await fetch("http://localhost:3000/", { headers: { "x-forwarded-host": "sec-a.localhost:3000" } });
console.log("via host:", viaHost.status, (await viaHost.text()).match(/<title>[^<]*<\/title>/)?.[0]);
const direct = await fetch(`http://localhost:3000/rw/${t.id}/x.png`);
const body = await direct.text();
console.log("direct /rw/<id>/x.png:", direct.status, body.match(/<title>[^<]*<\/title>/)?.[0], "nav links:", (body.match(/href="\/[a-z]+"/g) ?? []).slice(0, 6).join(" "));
await sql`update tenants set status='active' where id=${t.id}`;
process.exit(0);
