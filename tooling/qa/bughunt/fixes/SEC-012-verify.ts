/**
 * SEC-012 regression: changeMemberRole applies the same canAssign guard to the member's CURRENT role as removeMember.
 * Live probe on throwaway tenant sec-u1shop: u2 (security-creds.json) and the QA viewer user are temporarily
 * added as admins; u2 tries to demote the peer admin (must fail), then changes a manager (must work).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/SEC-012-verify.ts
 */
import { readFileSync } from "node:fs";
// @ts-expect-error untyped helper module
import { ADMIN, actionId, creds, db } from "../security-http.mjs";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
async function callAction(cookie: string, id: string, args: unknown[], path: string) {
  const r = await fetch(`${ADMIN}${path}`, { method: "POST", redirect: "manual", headers: { "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: ADMIN, cookie }, body: JSON.stringify(args) });
  const text = await r.text();
  return { status: r.status, ok: /"ok":true/.test(text) ? true : /"ok":false/.test(text) ? false : null, error: text.match(/"error":"([^"]*)"/)?.[1] ?? null };
}

const c = creds();
const am = JSON.parse(readFileSync(new URL("../admin_modules-creds.json", import.meta.url), "utf8"));
const sql = db();
const slug = "sec-u1shop";
const [t] = await sql`select id from tenants where slug = ${slug}`;
const [u2] = await sql`select id from "user" where email = ${c.u2.email}`;
const [peer] = await sql`select id from "user" where email = ${am.viewer.email}`;
const [mgr] = await sql`select id from "user" where email = ${am.manager.email}`;
const created: string[] = [];
const ensure = async (userId: string, role: string) => {
  const [m] = await sql`select id, role from tenant_members where tenant_id = ${t.id} and user_id = ${userId}`;
  if (m) {
    await sql`update tenant_members set role = ${role} where id = ${m.id}`;
    return { id: m.id as string, restore: m.role as string };
  }
  const [n] = await sql`insert into tenant_members (id, tenant_id, user_id, role) values (gen_random_uuid(), ${t.id}, ${userId}, ${role}) returning id`;
  created.push(n.id);
  return { id: n.id as string, restore: null };
};
const roleOf = async (id: string) => (await sql`select role from tenant_members where id = ${id}`)[0]?.role;
const A = await ensure(u2.id, "admin");
const B = await ensure(peer.id, "admin");
const M = await ensure(mgr.id, "manager");
const change = actionId("changeMemberRole", "settings");
const path = `/t/${slug}/settings/team`;
try {
  let r = await callAction(c.u2.cookie, change, [slug, B.id, "viewer"], path);
  check("admin cannot demote a peer admin", r.ok === false && (await roleOf(B.id)) === "admin", { ...r, role: await roleOf(B.id) });
  r = await callAction(c.u2.cookie, change, [slug, B.id, "manager"], path);
  check("admin cannot change a peer admin to manager either", r.ok === false && (await roleOf(B.id)) === "admin", { ...r, role: await roleOf(B.id) });
  r = await callAction(c.u2.cookie, change, [slug, M.id, "staff"], path);
  check("admin can still change a manager (lower rank)", r.ok === true && (await roleOf(M.id)) === "staff", { ...r, role: await roleOf(M.id) });
  r = await callAction(c.u2.cookie, change, [slug, M.id, "admin"], path);
  check("admin cannot promote someone to admin (unchanged rule)", r.ok === false && (await roleOf(M.id)) === "staff", { ...r, role: await roleOf(M.id) });
  r = await callAction(c.u1.cookie, change, [slug, B.id, "viewer"], path);
  check("owner can demote an admin", r.ok === true && (await roleOf(B.id)) === "viewer", { ...r, role: await roleOf(B.id) });
} finally {
  for (const x of [A, B, M]) if (x.restore) await sql`update tenant_members set role = ${x.restore} where id = ${x.id}`;
  if (created.length) await sql`delete from tenant_members where id in ${sql(created)}`;
}
console.log(fails === 0 ? "PASS SEC-012 (all checks)" : `FAIL SEC-012 (${fails} failing)`);
await sql.end({ timeout: 2 });
process.exitCode = fails === 0 ? 0 : 1;
