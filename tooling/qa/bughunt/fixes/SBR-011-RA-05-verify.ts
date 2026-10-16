/**
 * Restaurant packet – browser checks (Chromium, 390x844) on http://demo-restaurant.localhost:3000.
 *  SBR-011  7 lines with ~200-char Thai notes survive a reload (cart in localStorage, cookie = small id)
 *  SBR-011  placing a pickup order empties the cart (server deletes the id cookie)
 *  RA-05    closing the modifier sheet / cart sheet with Esc returns focus to the item card / cart bar
 * Run from tooling/: npx tsx qa/bughunt/fixes/SBR-011-RA-05-verify.ts
 */
import "../../../load-env";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";

const BASE = "http://demo-restaurant.localhost:3000";
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const ACTIVE = `(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + ' ' + (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g,' ').trim().slice(0,60) + (a.closest('[role=dialog]') ? ' [in dialog]' : ''); })()`;
const cartBar = (p: Page) => p.locator("[data-rw-cartbar] button");

async function addItem(p: Page, name: RegExp, note?: string) {
  await p.getByRole("button", { name }).first().click();
  const dlg = p.getByRole("dialog");
  await dlg.waitFor();
  const groups = dlg.getByRole("radiogroup");
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole("radio").first().click();
  if (note) await dlg.locator("textarea").fill(note);
  await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
  await dlg.waitFor({ state: "hidden" });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  p.setDefaultTimeout(30_000);
  const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));

  /* SBR-011 */
  await stableGoto(p, `${BASE}/menu`);
  await p.evaluate(() => {
    localStorage.clear();
    document.cookie = "rw_rcart=; path=/; max-age=0";
  });
  await stableGoto(p, `${BASE}/menu`);
  const note = "ไม่ใส่ผักชี ไม่เผ็ดมาก แยกน้ำจิ้ม ขอช้อนส้อมเพิ่มสองชุด และขอถุงแยกต่างหากด้วยนะคะ ขอบคุณค่ะ ".repeat(3).slice(0, 190);
  const names = [/แกงเขียวหวาน/, /ต้มยำกุ้ง/, /ผัดกะเพรา/, /ชาไทย/, /ข้าวเหนียวมะม่วง/, /บัวลอย/, /น้ำตะไคร้/];
  let added = 0;
  for (const [i, re] of names.entries()) {
    try {
      await addItem(p, re, `หมายเหตุ${i} ${note}`);
      added++;
    } catch (e) {
      console.log(`  (skip ${re}: ${(e as Error).message.split("\n")[0]})`);
    }
  }
  const before = await cartBar(p).getAttribute("aria-label");
  const cookie = (await ctx.cookies()).find((c) => c.name === "rw_rcart");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const after = await cartBar(p).getAttribute("aria-label").catch(() => "NO CART BAR");
  check(`SBR-011 ${added} long-note lines survive a reload`, added >= 6 && before === after, { before, after, cookieLen: cookie?.value.length });
  check("SBR-011 cookie only holds a short cart id", !!cookie && cookie.value.length < 40, cookie?.value);

  /* RA-05 – modifier sheet */
  await stableGoto(p, `${BASE}/order`);
  const card = p.locator("main button[data-item-id]:not([disabled])").first();
  const cardLabel = await card.getAttribute("aria-label");
  await card.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(400);
  const inSheet = String(await p.evaluate(ACTIVE));
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.waitForTimeout(400);
  const afterMod = String(await p.evaluate(ACTIVE));
  check("RA-05 modifier sheet: focus back on the item card after Esc", inSheet.includes("[in dialog]") && afterMod.includes(String(cardLabel).slice(0, 20)), { inSheet, afterMod, cardLabel });

  /* RA-05 – cart sheet */
  await cartBar(p).focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(400);
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.waitForTimeout(400);
  const afterCart = String(await p.evaluate(ACTIVE));
  check("RA-05 cart sheet: focus back on the cart bar after Esc", afterCart.includes("ออเดอร์ของคุณ"), afterCart);

  /* SBR-011 – a placed pickup order clears the cart */
  await cartBar(p).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByRole("button", { name: /ดำเนินการต่อ|ชำระเงิน|สั่ง/ }).last().click();
  await dlg.locator("input[name=name]").fill("QA ตะกร้า");
  await dlg.locator("input[name=phone]").fill("0897770011");
  const slot = dlg.getByRole("radio").first();
  if (await slot.count()) await slot.click().catch(() => {});
  const cash = dlg.getByRole("radio", { name: /เงินสด|ชำระที่ร้าน/ });
  if (await cash.count()) await cash.first().click().catch(() => {});
  await Promise.all([p.waitForURL(/\/orders\/r\//, { timeout: 60_000 }).catch(() => null), dlg.getByRole("button", { name: /ยืนยัน|สั่งอาหาร|ชำระ/ }).last().click()]);
  const placed = /\/orders\/r\//.test(p.url());
  await stableGoto(p, `${BASE}/order`);
  await p.waitForTimeout(1200);
  const bar = await cartBar(p).count();
  check("SBR-011 after placing the order the cart is empty", placed && bar === 0, { placed, url: p.url(), cartBarVisible: bar });

  check("no page errors", errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
