/**
 * last-03 verify: after a table session is paid (cash taken through the admin settle action), the guest table page
 * shows the paid state instead of "เรียกพนักงาน" / "ขอบิล" / the ordering menu: live (poll) and after a reload of
 * /t/<qr>; the API still refuses call-staff for the paid session (400); a guest without the cookie, and
 * "สั่งรอบใหม่", get an open session again. demo-restaurant, 390 px; the session(s) the script opened are closed at the end.
 * Run: cd tooling && npx tsx qa/bughunt/fixes/last-03-table-paid-verify.ts
 */
import "../../../load-env";
import { chromium, expect, type Page } from "@playwright/test";
import { getAdminDb, sql, withPlatform, withTenant } from "@rentweb/db";
import { registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { closeSession, getSessionByToken, onRestaurantOrderPaid, onRestaurantPaymentClosed } from "../../../../packages/modules/restaurant/src/services/index";
import { settleSession } from "../../../../packages/modules/restaurant/src/admin/index";
import { isolateHmr, stableGoto } from "./_dev-stable";

const BASE = "http://demo-restaurant.localhost:3000";
let pass = 0;
let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  ok ? pass++ : fail++;
};
const code = async (page: Page) => (await page.getByText(/รหัส\s+\S+/).first().textContent())?.match(/รหัส\s+(\S+)/)?.[1] ?? "";
const count = (page: Page, name: RegExp) => page.getByRole("button", { name }).count();

async function main() {
  registerPaymentHandler("rest_order", onRestaurantOrderPaid);
  registerPaymentClosedHandler("rest_order", onRestaurantPaymentClosed);
  const db = getAdminDb();
  const rows = (await withPlatform(db, (tx) =>
    tx.execute(sql`select n.id as tenant_id, t.id, t.name, t.qr_token from dining_tables t join tenants n on n.id = t.tenant_id
      where n.slug = 'demo-restaurant' and t.active and coalesce(t.zone, '') not like 'QA%'
        and not exists (select 1 from table_sessions s where s.table_id = t.id and s.status in ('open', 'bill_requested'))
      order by t.name limit 1`),
  )) as unknown as Array<{ tenant_id: string; id: string; name: string; qr_token: string }>;
  const table = rows[0];
  if (!table) throw new Error("no free demo-restaurant table");
  const tenantId = table.tenant_id;
  const tokens = new Set<string>();
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "th-TH", reducedMotion: "reduce" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await stableGoto(page, `${BASE}/t/${table.qr_token}`);
    const token = await code(page);
    tokens.add(token);
    check(!!token && (await count(page, /เรียกพนักงาน/)) === 1, `table ${table.name}: open session ${token} shows เรียกพนักงาน`);

    // one round from the menu
    await page.getByRole("button", { name: /บัวลอยไข่หวาน/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
    await page.locator("[data-rw-cartbar] button").click();
    await page.getByRole("dialog").getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
    await expect(page.getByRole("dialog").getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20000 });
    await page.getByRole("dialog").getByRole("button", { name: "เลือกเมนูต่อ" }).click();

    // staff takes cash (admin "รับเงินสด / ปิดโต๊ะ" action)
    const session = await withTenant(db, tenantId, (tx) => getSessionByToken(tx, tenantId, token));
    const settled = await withTenant(db, tenantId, (tx) => settleSession(tx, tenantId, session!.id, { mode: "cash", verifiedBy: "qa-last03" }));
    check(settled.ok && settled.value.closed && settled.value.amount > 0, `admin cash settle: ${JSON.stringify(settled.ok ? settled.value : settled)}`);

    // live: the 8 s poll picks the paid state up, the panel swaps the actions, the menu goes away (router.refresh)
    await expect(page.getByText("ชำระเงินเรียบร้อย ขอบคุณที่มาอุดหนุน").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /บัวลอยไข่หวาน/ })).toHaveCount(0, { timeout: 15000 });
    check((await count(page, /เรียกพนักงาน/)) === 0 && (await count(page, /^ขอบิล/)) === 0, "live: เรียกพนักงาน / ขอบิล hidden after payment");
    check((await count(page, /สั่งรอบใหม่/)) === 1, "live: สั่งรอบใหม่ offered instead");
    check((await page.locator("[data-rw-cartbar]").count()) === 0, "live: ordering menu / cart bar removed");
    await page.screenshot({ path: "screenshots/last-03-paid-live-390.png", fullPage: false });

    // reload /t/<qr>: same (paid) session, no actions
    await stableGoto(page, `${BASE}/t/${table.qr_token}`);
    const after = await code(page);
    check(after === token, `reload keeps the paid session (${after} == ${token})`);
    check((await count(page, /เรียกพนักงาน/)) === 0 && (await count(page, /^ขอบิล/)) === 0, "reload: เรียกพนักงาน / ขอบิล hidden");
    check((await page.getByText("ชำระแล้ว").count()) > 0 && (await count(page, /สั่งรอบใหม่/)) === 1, "reload: ชำระแล้ว badge + สั่งรอบใหม่");
    check((await page.getByRole("button", { name: /บัวลอยไข่หวาน/ }).count()) === 0, "reload: no ordering menu on the paid session");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `reload: no horizontal overflow at 390 (${overflow}px)`);
    await page.screenshot({ path: "screenshots/last-03-paid-reload-390.png", fullPage: true });
    const api = await page.evaluate(async (t) => (await fetch(`/api/restaurant/session/${t}/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "staff" }) })).status, token);
    check(api === 400, `call-staff API on the paid session -> ${api}`);

    // a guest without the cookie still gets an open session at that table
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "th-TH" });
    await isolateHmr(ctx2);
    const p2 = await ctx2.newPage();
    await stableGoto(p2, `${BASE}/t/${table.qr_token}`);
    const fresh = await code(p2);
    tokens.add(fresh);
    check(fresh !== token && (await count(p2, /เรียกพนักงาน/)) === 1, `new guest (no cookie) gets an open session ${fresh} with เรียกพนักงาน`);
    await ctx2.close();

    // สั่งรอบใหม่ on the paying phone: joins the table's open session again
    await page.getByRole("button", { name: /สั่งรอบใหม่/ }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("button", { name: /เรียกพนักงาน/ })).toHaveCount(1, { timeout: 20000 });
    const again = await code(page);
    tokens.add(again);
    check(again !== token && (await page.getByRole("button", { name: /บัวลอยไข่หวาน/ }).count()) > 0, `สั่งรอบใหม่ -> open session ${again} with the menu`);
    await ctx.close();
  } finally {
    // close the empty sessions this script opened (the paid one is already closed)
    for (const t of tokens) {
      await withTenant(db, tenantId, async (tx) => {
        const s = await getSessionByToken(tx, tenantId, t);
        if (s && (s.status === "open" || s.status === "bill_requested")) await closeSession(tx, tenantId, s.id);
      });
    }
    await b.close();
    await (db as unknown as { $client?: { end?: (o: unknown) => Promise<void> } }).$client?.end?.({ timeout: 2 });
  }
  console.log(`${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
