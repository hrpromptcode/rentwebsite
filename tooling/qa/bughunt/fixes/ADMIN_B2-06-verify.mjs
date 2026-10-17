/**
 * ADMIN_B2-06 regression (live, admin :3001, throwaway tenants from admin_b2-creds.json):
 *  - CMS-only tenant (qa-b2-corp-sppp): no payments item, content item = "แก้ไขและเผยแพร่หน้าเว็บของคุณ" linking to the
 *    home-page editor; with logo/theme/LINE done and a page published after provisioning the bar reaches 100 %
 *    (custom domain is optional). Tenant onboarding + page published_at are restored afterwards.
 *  - commerce tenant (qa-b2-shop-sppp) still shows the item + payments rows.
 * Run from tooling/:  MSYS_NO_PATHCONV=1 node qa/bughunt/fixes/ADMIN_B2-06-verify.mjs
 */
import { readFileSync } from "node:fs";
import { ADMIN, db, get, signIn } from "../security-http.mjs";
let fails = 0;
const check = (name, cond, extra = "") => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`); };
const c = JSON.parse(readFileSync(new URL("../admin_b2-creds.json", import.meta.url), "utf8"));
const s = await signIn(c.owner.email, c.owner.password);
const text = async (p) => { const r = await get(`${ADMIN}${p}`, s.cookie); return r.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); };
const pct = (t) => Number(t.match(/(\d{1,3})\s?%/)?.[1] ?? -1);
const sql = db();
const corp = c.tenants.find((t) => t.key === "corporate");
const [before] = await sql`select onboarding, created_at from tenants where id = ${corp.id}`;
const [home] = await sql`select id, published_at from pages where tenant_id = ${corp.id} and kind = 'home'`;
try {
  let t = await text(`/t/${corp.slug}/dashboard`);
  check("corp: no payments item", !t.includes("ตั้งค่าช่องทางรับเงิน"));
  check("corp: no 'real item' item", !t.includes("เพิ่มรายการจริงอย่างน้อย 1 รายการ"));
  check("corp: page item shown", t.includes("แก้ไขและเผยแพร่หน้าเว็บของคุณ"));
  const raw = (await get(`${ADMIN}/t/${corp.slug}/dashboard`, s.cookie)).text;
  check("corp: page item links to home editor", raw.includes(`/t/${corp.slug}/pages/${home.id}`));
  // complete every required item
  const ob = { ...(before.onboarding ?? {}), steps: { ...((before.onboarding ?? {}).steps ?? {}), logo: true, theme: true, line: true } };
  await sql`update tenants set onboarding = ${sql.json(ob)} where id = ${corp.id}`;
  await sql`update pages set published_at = now() where id = ${home.id}`;
  t = await text(`/t/${corp.slug}/dashboard`);
  check("corp: all required done -> 100%", pct(t) === 100, pct(t));
} finally {
  await sql`update tenants set onboarding = ${sql.json(before.onboarding ?? {})} where id = ${corp.id}`;
  await sql`update pages set published_at = ${home.published_at} where id = ${home.id}`;
}
const t2 = await text(`/t/${corp.slug}/dashboard`);
check("corp: restored (< 100%)", pct(t2) < 100, pct(t2));
const shop = c.tenants.find((t) => t.key === "shop");
const t3 = await text(`/t/${shop.slug}/dashboard`);
check("shop: item + payments rows kept", t3.includes("เพิ่มรายการจริงอย่างน้อย 1 รายการ") && t3.includes("ตั้งค่าช่องทางรับเงิน"));
await sql.end();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
