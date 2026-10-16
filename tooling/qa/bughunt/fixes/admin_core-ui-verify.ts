/**
 * Browser checks for packet admin_core (AC-04, AC-05, COR-29, AC-06/AM-02, RA-06, SEC-002 UI) at 1440 and 390.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/admin_core-ui-verify.ts
 * Screenshots: tooling/screenshots/fix-admin_core-*.png
 */
import "../../../load-env";
import path from "node:path";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
// @ts-expect-error untyped helper module
import { ADMIN, actionId, creds, db } from "../security-http.mjs";

const SHOTS = path.resolve(process.cwd(), "screenshots");
let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const go = (p: Page, url: string) => p.goto(`${ADMIN}${url}`, { waitUntil: "networkidle", timeout: 180_000 });
const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function login(p: Page, email: string, password: string) {
  await go(p, "/login");
  await p.fill("#email", email);
  await p.fill("#password", password);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), p.click('button[type="submit"]')]);
  await p.waitForLoadState("networkidle");
}
const only = process.argv.slice(2);
const want = (k: string) => only.length === 0 || only.includes(k);

const browser = await chromium.launch({ headless: true });
const sec = creds();
const sql = db();
try {
  /* ---------------- superadmin pages ---------------- */
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    if (!want("admin")) break;
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.setDefaultTimeout(60_000);
    await login(p, "admin@rentweb.local", "Admin1234!");
    const W = vp.width;
    const kpiSection = p.locator('section[aria-label="ตัวเลขวันนี้"]');

    // AC-06 / AM-02 / COR-29: restaurant dashboard
    await go(p, "/t/demo-restaurant/dashboard");
    const kpiText = await kpiSection.innerText();
    check(`[${W}] restaurant dashboard shows restaurant KPIs`, /ออเดอร์วันนี้/.test(kpiText) && /โต๊ะกำลังใช้งาน|ไม่มีโต๊ะที่เปิดอยู่/.test(kpiText) && /ยอดขายวันนี้/.test(kpiText) && /เฉพาะที่ชำระแล้ว/.test(kpiText) && /จองโต๊ะวันนี้/.test(kpiText) && /สลิปรอตรวจ/.test(kpiText), kpiText.replace(/\s+/g, " ").slice(0, 220));
    check(`[${W}] restaurant dashboard no 'enable a module' card`, !/เปิดโมดูล/.test(kpiText));
    check(`[${W}] restaurant slips KPI links to /payments`, (await kpiSection.locator('a[href="/t/demo-restaurant/payments"]').count()) === 1);
    check(`[${W}] restaurant checklist content -> /restaurant/menu`, (await p.locator('a[href="/t/demo-restaurant/restaurant/menu"]').filter({ hasText: "เพิ่มรายการจริง" }).count()) === 1);
    const truncated = await kpiSection.locator("p.truncate").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    check(`[${W}] restaurant KPI labels not truncated`, truncated.length === 0, truncated);
    check(`[${W}] restaurant dashboard no horizontal overflow`, (await overflow(p)) <= 0, await overflow(p));
    await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-dashboard-restaurant-${W}.png`), fullPage: W < 500 });

    // COR-29: shop dashboard slips KPI
    await go(p, "/t/demo-shop/dashboard");
    const shopKpi = await kpiSection.innerText();
    check(`[${W}] shop dashboard has slips KPI linked to /payments`, /สลิปรอตรวจ/.test(shopKpi) && (await kpiSection.locator('a[href="/t/demo-shop/payments"]').count()) === 1, shopKpi.replace(/\s+/g, " ").slice(0, 160));
    check(`[${W}] shop dashboard no horizontal overflow`, (await overflow(p)) <= 0, await overflow(p));
    await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-dashboard-shop-${W}.png`), fullPage: W < 500 });

    // RA-06: team settings
    for (const slug of ["demo-shop", "demo-restaurant"]) {
      await go(p, `/t/${slug}/settings/team`);
      const ov = await overflow(p);
      const cardsFit = await p.evaluate(() => [...document.querySelectorAll("main [data-slot=card], main .card")].every((el) => el.getBoundingClientRect().right <= window.innerWidth + 0.5));
      check(`[${W}] ${slug} settings/team no horizontal overflow`, ov <= 0 && cardsFit, { ov, cardsFit });
      if (slug === "demo-shop") await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-team-${W}.png`), fullPage: true });
    }

    // AC-04: new-page dialog slug typing (dialog is closed again, nothing is created)
    await go(p, "/t/demo-shop/pages");
    await p.getByRole("button", { name: /สร้างหน้าใหม่/ }).first().click();
    const np = p.locator("#np-slug");
    await np.click();
    await p.keyboard.type("my-page", { delay: 40 });
    check(`[${W}] new-page slug keeps hyphen while typing`, (await np.inputValue()) === "my-page", await np.inputValue());
    await np.fill("");
    await np.click();
    await p.keyboard.type("abc-", { delay: 40 });
    const mid = await np.inputValue();
    await p.locator("#np-title").click();
    const after = await np.inputValue();
    check(`[${W}] new-page slug trailing hyphen kept while typing, trimmed on blur`, mid === "abc-" && after === "abc", { mid, after });
    await p.keyboard.press("Escape");

    // SEC-002 UI: platform suspension on sec-u1shop (state restored afterwards)
    const [t] = await sql`select id, status, trial_ends_at, suspended_at from tenants where slug = 'sec-u1shop'`;
    if (t && sec.admin?.cookie) {
      try {
        const r = await fetch(`${ADMIN}/console/tenants/${t.id}`, {
          method: "POST",
          headers: { "next-action": actionId("updateTenantStatus", "console"), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: ADMIN, cookie: sec.admin.cookie },
          body: JSON.stringify([{ tenantId: t.id, status: "suspended", reason: "QA: ค้างชำระเกิน 30 วัน" }]),
        });
        await r.text();
        await go(p, "/t/sec-u1shop/settings/danger");
        const body = await p.locator("main").innerText();
        check(`[${W}] danger page: platform suspension shows staff notice + reason`, /ถูกระงับโดยทีมงาน RentWeb/.test(body) && /ค้างชำระเกิน 30 วัน/.test(body), body.replace(/\s+/g, " ").slice(0, 240));
        check(`[${W}] danger page: no reactivate button on platform suspension`, (await p.getByRole("button", { name: /เปิดใช้งาน/ }).count()) === 0);
        check(`[${W}] danger page no horizontal overflow`, (await overflow(p)) <= 0, await overflow(p));
        await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-danger-platform-${W}.png`), fullPage: true });
        await go(p, `/console/tenants/${t.id}`);
        check(`[${W}] console status card has reason input`, (await p.locator("#c-reason").count()) === 1);
        check(`[${W}] console tenant page no horizontal overflow`, (await overflow(p)) <= 0, await overflow(p));
        await p.locator("#c-reason").scrollIntoViewIfNeeded();
        await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-console-status-${W}.png`) });
        // self-suspension: owner suspends from the danger zone -> the reactivate button is offered
        const call = async (cookie: string, name: string, hint: string, args: unknown[], at: string) => {
          const res = await fetch(`${ADMIN}${at}`, { method: "POST", headers: { "next-action": actionId(name, hint), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: ADMIN, cookie }, body: JSON.stringify(args) });
          return res.text();
        };
        await call(sec.admin.cookie, "updateTenantStatus", "console", [{ tenantId: t.id, status: "active" }], `/console/tenants/${t.id}`);
        await call(sec.u1.cookie, "suspendOwnTenant", "settings", ["sec-u1shop"], "/t/sec-u1shop/settings/danger");
        await go(p, "/t/sec-u1shop/settings/danger");
        const selfBody = await p.locator("main").innerText();
        check(`[${W}] danger page: self-suspension offers reactivate, no staff notice`, (await p.getByRole("button", { name: /เปิดใช้งาน/ }).count()) === 1 && !/ถูกระงับโดยทีมงาน/.test(selfBody), selfBody.replace(/\s+/g, " ").slice(0, 200));
        await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-danger-self-${W}.png`), fullPage: true });
      } finally {
        await sql`update tenants set status = ${t.status}, trial_ends_at = ${t.trial_ends_at}, suspended_at = ${t.suspended_at} where id = ${t.id}`;
      }
    }
    await ctx.close();
  }

  /* ---------------- onboarding wizard (tenant owner, nothing is created) ---------------- */
  const ac = JSON.parse(readFileSync(path.resolve(process.cwd(), "qa/bughunt/admin_core-creds.json"), "utf8"));
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    if (!want("wizard")) break;
    const W = vp.width;
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.setDefaultTimeout(60_000);
    await login(p, ac.owner.email, ac.owner.password);
    await go(p, "/onboarding");
    await p.getByRole("button", { name: /ร้านค้าออนไลน์/ }).first().click();
    await p.getByRole("button", { name: /ถัดไป/ }).click();
    await p.locator("#shop-name").waitFor();
    await p.locator("#shop-name").fill("QA slug test");
    const slugIn = p.locator("#shop-slug");
    const status = () => p.locator("#slug-status").innerText();
    const next = p.getByRole("button", { name: /ถัดไป/ });
    await slugIn.fill("");
    await slugIn.click();
    await p.keyboard.type("my-shop", { delay: 60 });
    await p.waitForTimeout(400);
    check(`[${W}] wizard: typed 'my-shop' stays 'my-shop'`, (await slugIn.inputValue()) === "my-shop", await slugIn.inputValue());
    // pause on a trailing hyphen long enough for the debounced check: it must not strip it
    await slugIn.fill("");
    await p.keyboard.type("qa-x-", { delay: 40 });
    await p.waitForTimeout(2500);
    check(`[${W}] wizard: trailing hyphen survives the availability check`, (await slugIn.inputValue()) === "qa-x-", await slugIn.inputValue());
    await p.locator("#shop-name").click();
    check(`[${W}] wizard: trailing hyphen trimmed on blur`, (await slugIn.inputValue()) === "qa-x", await slugIn.inputValue());
    // AC-05: quick changes; the final value must show its own answer
    const cases: Array<[string[], string, RegExp, boolean]> = [
      [["admin", "www"], "www", /สงวน/, false],
      [["www", "qa-free-slug-ac05"], "qa-free-slug-ac05", /ว่าง/, true],
      [["qa-free-slug-ac05", "demo-shop"], "demo-shop", /สงวน/, false],
    ];
    for (const [seq, final, re, nextOn] of cases) {
      for (const s of seq) {
        await slugIn.fill(s);
        await p.waitForTimeout(550); // debounce (400ms) fires -> request in flight, then change again
      }
      await p.waitForFunction(() => !/กำลังตรวจสอบ/.test(document.querySelector("#slug-status")?.textContent ?? ""), null, { timeout: 30_000 }).catch(() => {});
      await p.waitForTimeout(1500);
      const st = (await status()).trim();
      const nextEnabled = await next.isEnabled();
      check(`[${W}] wizard: ${seq.join(" -> ")} shows answer for '${final}'`, (await slugIn.inputValue()) === final && re.test(st) && nextEnabled === nextOn, { st, nextEnabled });
    }
    check(`[${W}] wizard no horizontal overflow`, (await overflow(p)) <= 0, await overflow(p));
    await p.screenshot({ path: path.join(SHOTS, `fix-admin_core-wizard-slug-${W}.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  await sql.end({ timeout: 2 });
}
console.log(fails === 0 ? "PASS admin_core UI (all checks)" : `FAIL admin_core UI (${fails} failing)`);
process.exitCode = fails === 0 ? 0 : 1;
