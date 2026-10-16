import "../../load-env";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { HERE, SHOTS, origin, newCtx, gotoRetry, watchConsole, runChecks } from "./responsive_b2-lib";

/**
 * responsive_b2 keyboard follow-ups: where focus goes after wizard steps / add-to-cart (next Tab target), calendar Tab cost,
 * checkout submit by keyboard, place an order and test the cancel-order dialog (trap / Esc / focus return), order page at 390.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-kbd2.ts [book] [cart] [order]
 */
const parts = process.argv.slice(2);
const want = (p: string) => !parts.length || parts.includes(p);
const log = (...a: unknown[]) => console.log(...a);
const ACT = `(() => { const el = document.activeElement; if (!el || el === document.body) return "body"; const r = el.getBoundingClientRect(); return el.tagName.toLowerCase() + " '" + (el.getAttribute("aria-label") || el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 40) + "' @y=" + Math.round(r.top) + (el.closest("header") ? " [in header]" : el.closest("main") ? " [in main]" : el.closest("footer") ? " [in footer]" : ""); })()`;
const act = (p: Page) => p.evaluate(ACT) as Promise<string>;

async function tabTo(page: Page, pred: string, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(() => { const el = document.activeElement; return !!el && (${pred}); })()`)) return i + 1;
  }
  return -1;
}

async function book() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, 390, "no-preference", path.join(HERE, "responsive_b2-state-demo-salon.json"));
  const page = await ctx.newPage();
  watchConsole(page);
  await gotoRetry(page, origin("demo-salon") + "/book");
  await page.waitForTimeout(2000);
  const live = await page.evaluate(`[...document.querySelectorAll("main [aria-live], main [role=status], main [role=alert]")].map(e => e.tagName + ":" + (e.getAttribute("aria-live") || e.getAttribute("role")) + " '" + (e.textContent||"").trim().slice(0,30) + "'")`);
  log(`  live regions in /book: ${JSON.stringify(live)}`);
  const n1 = await tabTo(page, `el.closest("main") && el.tagName === "BUTTON" && /นาที/.test(el.innerText)`);
  log(`  service option after ${n1} Tabs: ${await act(page)}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  log(`  after Enter: active=${await act(page)}; step heading=${(await page.locator("main h2").first().innerText().catch(() => "?")).slice(0, 40)}`);
  await page.keyboard.press("Tab");
  log(`  next Tab lands on: ${await act(page)}`);
  await page.keyboard.press("Tab");
  log(`  2nd Tab: ${await act(page)}`);
  // staff step: choose 'ใครก็ได้'
  const n2 = await tabTo(page, `el.closest("main") && el.tagName === "BUTTON" && /ใครก็ได้/.test(el.innerText)`);
  log(`  'any staff' reached after ${n2} more Tabs`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  log(`  after Enter: active=${await act(page)}`);
  await page.keyboard.press("Tab");
  log(`  next Tab lands on: ${await act(page)}`);
  // calendar: how many Tab stops inside the grid; does ArrowRight move between days?
  const gridInfo = await page.evaluate(`(() => { const g = document.querySelector("[role=grid]"); if (!g) return null; const b = [...g.querySelectorAll("button")]; return { buttons: b.length, enabled: b.filter(x => !x.disabled).length, rows: g.querySelectorAll("[role=row]").length, labels: b.slice(0, 3).map(x => x.getAttribute("aria-label")), tabindexMinus: b.filter(x => x.tabIndex < 0).length }; })()`);
  log(`  calendar grid: ${JSON.stringify(gridInfo)}`);
  const n3 = await tabTo(page, `el.closest("[role=grid]") && !el.disabled`);
  log(`  first enabled day after ${n3} Tabs: ${await act(page)}`);
  const before = await act(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  log(`  ArrowRight: ${before} -> ${await act(page)}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  log(`  after choosing day: active=${await act(page)}`);
  await page.keyboard.press("Tab");
  log(`  next Tab lands on: ${await act(page)}`);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-book-afterday-390.png") });
  await browser.close();
}

async function cart() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, 390, "no-preference");
  const page = await ctx.newPage();
  await gotoRetry(page, origin("demo-shop") + "/products/sofa-throw");
  await page.waitForTimeout(2000);
  const n = await tabTo(page, `/ใส่ตะกร้า|เพิ่มลงตะกร้า|เพิ่มในตะกร้า/.test(el.innerText || "")`);
  log(`  add-to-cart after ${n} Tabs: ${await act(page)}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  const toast = await page.evaluate(`[...document.querySelectorAll("[data-sonner-toast]")].map(t => (t.innerText||"").replace(/\\s+/g," ") + " live=" + (t.closest("[aria-live]")?.getAttribute("aria-live")))`);
  log(`  after Enter: active=${await act(page)} toast=${JSON.stringify(toast)}`);
  await page.keyboard.press("Tab");
  log(`  next Tab lands on: ${await act(page)}`);
  const addBtn = await page.evaluate(`(() => { const b = [...document.querySelectorAll("main button")].find(b => /ตะกร้า/.test(b.innerText)); return b ? b.outerHTML.slice(0, 200) : null; })()`);
  log(`  add button now: ${addBtn}`);
  // checkout with item: submit empty by keyboard
  await gotoRetry(page, origin("demo-shop") + "/checkout");
  await page.waitForTimeout(2000);
  const btns = await page.evaluate(`[...document.querySelectorAll("button[type=submit]")].map(b => (b.innerText||"").trim().slice(0,30) + " visible=" + !!b.offsetParent + " disabled=" + b.disabled)`);
  log(`  submit buttons: ${JSON.stringify(btns)}`);
  const vis = page.locator("button[type=submit]:visible").filter({ hasText: /สั่งซื้อ|ชำระ|ยืนยัน/ }).last();
  if (await vis.count()) {
    await vis.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const v = await page.evaluate(`(() => { const e = document.activeElement; return { active: e === document.body ? "body" : (e.id || e.tagName), msg: e.validationMessage || "", inView: (() => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }; })()`);
    log(`  empty submit via Enter: ${JSON.stringify(v)} url=${new URL(page.url()).pathname}`);
  }
  await browser.close();
}

async function order() {
  const browser = await chromium.launch();
  const state = path.join(HERE, "responsive_b2-state-demo-shop.json");
  const ctx = await newCtx(browser, 390, "no-preference", state);
  const page = await ctx.newPage();
  const logs = watchConsole(page);
  await gotoRetry(page, origin("demo-shop") + "/products/sofa-throw");
  await page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first().click();
  await page.waitForTimeout(3000);
  await gotoRetry(page, origin("demo-shop") + "/checkout");
  await page.waitForTimeout(2000);
  if (new URL(page.url()).pathname !== "/checkout") {
    log("  checkout redirected (empty cart?) -> " + page.url());
    await browser.close();
    return;
  }
  const fill = async (sel: string, v: string) => { const l = page.locator(sel); if ((await l.count()) && !(await l.inputValue())) await l.fill(v); };
  await fill("#name", "QA B2 ทดสอบ");
  await fill("#phone", "0891234567");
  const ship = page.locator("input[name=shippingMethodId]");
  if (await ship.count()) {
    const pickup = page.locator("label").filter({ hasText: /รับเอง|รับที่ร้าน/ }).first();
    if (await pickup.count()) await pickup.click();
    else await page.locator("input[name=shippingMethodId]").first().check({ force: true });
  }
  await page.waitForTimeout(800);
  if (await page.locator("#line1:visible").count()) {
    await fill("#line1", "1 ถนนทดสอบ");
    await fill("#subdistrict", "ลุมพินี");
    await fill("#district", "ปทุมวัน");
    await page.selectOption("#province", { index: 1 });
    await fill("#postalCode", "10330");
  }
  const pay = page.locator("input[name=paymentMethod][value=promptpay], input[name=paymentMethod]").first();
  if (await pay.count()) await pay.check({ force: true }).catch(() => {});
  const submit = page.locator("button[type=submit]:visible").filter({ hasText: /สั่งซื้อ|ชำระ|ยืนยัน/ }).last();
  await submit.click();
  await page.waitForURL(/\/orders\//, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  log(`  order page: ${page.url()}`);
  if (!/\/orders\//.test(page.url())) {
    await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-checkout-fail-390.png"), fullPage: true });
    log("  errors: " + (await page.locator("[role=alert], .text-destructive").allInnerTexts()).join(" | "));
    await browser.close();
    return;
  }
  const r = await runChecks(page, { tap: true });
  log(`  order page @390 sw=${r.sw}/${r.vw} overflow=${JSON.stringify(r.overflow).slice(0, 300)} tap=${JSON.stringify(r.tap).slice(0, 500)} thai=${JSON.stringify(r.thaiClip).slice(0, 300)} noName=${JSON.stringify(r.noName)}`);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-order-390.png"), fullPage: true });
  const trig = page.locator("main button[aria-haspopup=dialog]").first();
  if (await trig.count()) {
    await trig.focus();
    const before = await act(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    const first = await act(page);
    let left = 0;
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate("!!document.activeElement.closest('[role=dialog],[role=alertdialog]')"))) left++; }
    const box = await page.locator("[role=dialog], [role=alertdialog]").first().boundingBox();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    log(`  cancel dialog: trigger=${before} firstFocus=${first} Tab x12 left=${left} box=${JSON.stringify(box)} afterEsc=${await act(page)} open=${await page.locator("[role=dialog]:visible,[role=alertdialog]:visible").count()}`);
  } else log("  no cancel-order trigger on the order page");
  // same order page at 1440
  const url = page.url();
  const c2 = await newCtx(browser, 1440, "no-preference", state);
  const p2 = await c2.newPage();
  await gotoRetry(p2, url);
  await p2.waitForTimeout(1500);
  const r2 = await runChecks(p2, {});
  log(`  order page @1440 sw=${r2.sw}/${r2.vw} overflow=${JSON.stringify(r2.overflow).slice(0, 300)} thai=${JSON.stringify(r2.thaiClip).slice(0, 300)}`);
  // account/orders now has an order
  for (const w of [390, 1440]) {
    const c3 = await newCtx(browser, w, "no-preference", state);
    const p3 = await c3.newPage();
    await gotoRetry(p3, origin("demo-shop") + "/account/orders");
    await p3.waitForTimeout(1500);
    const r3 = await runChecks(p3, { tap: w === 390 });
    log(`  /account/orders @${w} sw=${r3.sw}/${r3.vw} overflow=${JSON.stringify(r3.overflow).slice(0, 300)} tap=${JSON.stringify(r3.tap).slice(0, 400)} thai=${JSON.stringify(r3.thaiClip).slice(0, 200)}`);
    if (w === 390) await p3.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-account-orders-390.png"), fullPage: true });
    await c3.close();
  }
  if (logs.length) log("  console: " + [...new Set(logs)].slice(0, 4).join(" || "));
  await browser.close();
}

async function main() {
  if (want("book")) { log("\n=== book"); await book(); }
  if (want("cart")) { log("\n=== cart"); await cart(); }
  if (want("order")) { log("\n=== order"); await order(); }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
