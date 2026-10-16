import { readFileSync } from "node:fs";
import { eq, tenants } from "@rentweb/db";
import { ADMIN, adminState, anyToast, done, go, hreq, launch, newCtx, newPage, out, plat, readCreds, shot, type P } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
const txt = async (p: P) => (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  out("/console", { status: await go(page, "/console"), text: (await txt(page)).slice(0, 250) });
  out("search qa-b2", { status: await go(page, `/console/tenants?q=qa-b2-`), rows: await page.locator("main tbody tr, main li a[href^='/console/tenants/']").count(), text: (await txt(page)).slice(0, 160) });
  await go(page, `/console/tenants?q=%25`);
  out("search '%'", (await txt(page)).slice(0, 120));
  out("filter suspended", { status: await go(page, `/console/tenants?status=suspended`), text: (await txt(page)).slice(0, 160) });
  out("bad page param", { status: await go(page, `/console/tenants?page=-5`), text: (await txt(page)).slice(0, 100) });
  const corp = T.corporate;
  out("detail bogus id", { status: await go(page, `/console/tenants/not-a-uuid`) });
  out("detail", { status: await go(page, `/console/tenants/${corp.id}`), text: (await txt(page)).slice(0, 400) });
  await page.screenshot({ path: shot("console-detail") });
  // impersonate
  await Promise.all([page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60_000 }).catch(() => {}), page.getByRole("button", { name: /เข้าดูหลังบ้าน/ }).first().click().catch((e) => out("impersonate click", String(e).slice(0, 100)))]);
  out("impersonating", { url: page.url().replace(ADMIN, ""), banner: (await page.locator("body").innerText()).match(/[^\n]*(กำลังดู|สวมสิทธิ์|ในฐานะ|impersonat)[^\n]*/i)?.[0] });
  const stop = page.getByRole("button", { name: /ออกจากโหมดนี้/ }).first();
  if (await stop.count()) { await Promise.all([page.waitForURL(/\/console/, { timeout: 60_000 }).catch(() => {}), stop.click()]); }
  out("after stop", page.url().replace(ADMIN, ""));
  // suspend
  await go(page, `/console/tenants/${corp.id}`);
  await page.locator("#c-status").click();
  await page.getByRole("option", { name: "ระงับ" }).click();
  await page.fill("#c-reason", "QA B2 ทดสอบการระงับ");
  out("suspend", await anyToast(page, () => page.getByRole("button", { name: "อัปเดตสถานะ" }).click()));
  const [s1] = await plat((tx) => tx.select({ status: tenants.status, suspendedAt: tenants.suspendedAt }).from(tenants).where(eq(tenants.id, corp.id)));
  out("db status", s1);
  await new Promise((r) => setTimeout(r, 1500));
  const sf = await hreq(`${corp.slug}.localhost:3000`, "/");
  out("storefront while suspended", { status: sf.status, title: sf.body.match(/<title>([^<]*)<\/title>/)?.[1], text: sf.body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) });
  const sf2 = await hreq(`${corp.slug}.localhost:3000`, "/contact");
  out("storefront /contact while suspended", { status: sf2.status, title: sf2.body.match(/<title>([^<]*)<\/title>/)?.[1] });
  const api = await hreq(`${corp.slug}.localhost:3000`, "/api/forms/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "QA", phone: "0812345678", message: "suspended?" }) });
  out("contact form API while suspended", { status: api.status, body: api.body.slice(0, 120) });
  // owner view
  const octx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const op = await newPage(octx);
  await go(op, `/t/${corp.slug}/dashboard`);
  out("owner dashboard while suspended", (await txt(op)).slice(0, 250));
  await go(op, `/t/${corp.slug}/settings/danger`);
  out("owner danger while suspended", (await txt(op)).slice(0, 400));
  await op.screenshot({ path: shot("owner-danger-platform-suspended") });
  // reactivate
  await go(page, `/console/tenants/${corp.id}`);
  await page.locator("#c-status").click();
  await page.getByRole("option", { name: "ทดลองใช้" }).click();
  out("reactivate", await anyToast(page, () => page.getByRole("button", { name: "อัปเดตสถานะ" }).click()));
  await new Promise((r) => setTimeout(r, 1500));
  const sf3 = await hreq(`${corp.slug}.localhost:3000`, "/");
  out("storefront after reactivate", { status: sf3.status, title: sf3.body.match(/<title>([^<]*)<\/title>/)?.[1] });
  // templates & plans
  out("/console/templates", { status: await go(page, "/console/templates"), text: (await txt(page)).slice(0, 300) });
  out("/console/plans", { status: await go(page, "/console/plans"), text: (await txt(page)).slice(0, 300) });
  out("errors", page.__errors.slice(0, 6));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
