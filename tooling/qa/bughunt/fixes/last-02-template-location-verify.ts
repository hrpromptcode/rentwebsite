/**
 * last-02 verify (AC-02 residual): a freshly provisioned non-demo tenant of every template shows no sample location /
 * opening-hours copy (home FAQ, contact body, hero eyebrow ...) on its live storefront pages, while the demo-* tenants
 * keep theirs. Provisions qa-last02-<template>-<rand> tenants (no sample data) in the dev DB and reads "/" and
 * "/contact" from the running storefront (127.0.0.1:3000 + Host header).
 * Run: cd tooling && npx tsx qa/bughunt/fixes/last-02-template-location-verify.ts
 */
import "../../../load-env";
import { getAdminDb, sql, withPlatform } from "@rentweb/db";
import { provisionTenant } from "@rentweb/core/tenant";
import { getTemplate } from "@rentweb/templates";
import { fetchTenant } from "../admin_core-lib";

let pass = 0;
let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  ok ? pass++ : fail++;
};

/** template -> [sample copy that must be gone on a new tenant, neutral replacement that must be there] */
const CASES: Record<string, Array<[string, string]>> = {
  shop: [
    ["มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00", "[มีหน้าร้านไหม · ที่ตั้งร้าน · วัน–เวลาเปิด]"],
    ["ทีมงานตอบ LINE 9:00–21:00", "ทีมงานตอบ LINE ในเวลาทำการ"],
  ],
  restaurant: [
    ["เดินจาก BTS อารีย์ 5 นาที", "[ที่จอดรถ · การเดินทางมาร้าน]"],
    ["BTS อารีย์ ทางออก 3 เดิน 5 นาที", "[การเดินทางมาร้าน · ที่จอดรถ]"],
  ],
  clinic: [["คลินิกอยู่ชั้น 3 เอ็มควอเทียร์ ติด BTS พร้อมพงษ์", "[ที่ตั้งคลินิก · การเดินทาง · ที่จอดรถ]"]],
  salon: [
    ["สปาและนวดไทย · สุขุมวิท 31", "สปาและนวดไทย · [ย่านของร้าน]"],
    ["บ้านเก่าในซอยสวัสดี", "มุมสงบ ให้คุณได้พักอย่างเต็มที่"],
  ],
  cafe: [
    ["อบใหม่ทุกเช้า 6 โมง", "อบใหม่ทุกเช้า"],
    ["รับได้พรุ่งนี้ตั้งแต่ 8 โมง", "สั่งวันนี้ รับได้พรุ่งนี้ตามเวลาเปิดร้าน"],
  ],
  corporate: [],
};
// opening hours in settings.contact.hours are kept on purpose (ordering/reservation slots, AC-02), so only page-copy places here
const GENERIC = [/BTS|MRT/, /ซอยอารีย์|ซอยสวัสดี|ถ\.นิมมาน|เอ็มควอเทียร์/];

async function main() {
  const db = getAdminDb();
  const rand = Math.random().toString(36).slice(2, 6);
  const demos = new Set(
    ((await withPlatform(db, (tx) => tx.execute(sql`select slug from tenants where slug like 'demo-%'`))) as unknown as Array<{ slug: string }>).map((r) => r.slug),
  );
  for (const [key, pairs] of Object.entries(CASES)) {
    const tpl = getTemplate(key);
    if (!tpl) throw new Error(`template ${key} missing`);
    const r = await provisionTenant({ name: `QA last02 ${key}`, slug: `qa-last02-${key}-${rand}`, template: tpl, db, withSampleData: false });
    const host = `${r.slug}.localhost:3000`;
    const pages = await Promise.all(["/", "/contact"].map((p) => fetchTenant(host, p)));
    const body = pages.map((p) => p.body).join("\n");
    check(pages.every((p) => p.status === 200), `${host} / and /contact -> ${pages.map((p) => p.status).join(", ")}`);
    for (const [gone, neutral] of pairs) {
      check(!body.includes(gone), `${key} new tenant: sample copy gone "${gone}"`);
      check(body.includes(neutral), `${key} new tenant: shows "${neutral}"`);
    }
    for (const re of GENERIC) check(!re.test(body), `${key} new tenant: no ${re} (${body.match(re)?.[0] ?? "none"})`);

    const demo = `demo-${key}`;
    if (demos.has(demo) && pairs.length) {
      const d = (await Promise.all(["/", "/contact"].map((p) => fetchTenant(`${demo}.localhost:3000`, p)))).map((p) => p.body).join("\n");
      check(pairs.every(([gone]) => d.includes(gone)), `${demo} (demo) keeps its sample location copy`);
    }
  }
  await (db as unknown as { $client?: { end?: (o: unknown) => Promise<void> } }).$client?.end?.({ timeout: 2 });
  console.log(`${pass} PASS / ${fail} FAIL (tenants qa-last02-*-${rand})`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
