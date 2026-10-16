import "../../load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

/** responsive_a11y bughunt: stateful pages at 390 (cart/checkout with items, restaurant sheets, keyboard in sheets). */
const HERE = path.resolve("qa/bughunt");
const CHECKS = readFileSync(path.join(HERE, "responsive_a11y-checks.js"), "utf8").replace(/^\s*\/\/.*\n/, "").trim();
const log = (...a: unknown[]) => console.log(...a);
const run = async (page: Page, label: string, opts = { tap: true, contrast: false }) => {
  const r = (await page.evaluate(`(${CHECKS})(${JSON.stringify(opts)})`)) as Record<string, any>;
  const keys = ["overflow", "imgNoAlt", "imgDistorted", "noName", "noLabel", "fixedOverlap", "covered", "hidden", "tap", "contrast"];
  log(`\n## ${label} sw=${r.sw}/${r.vw}`);
  for (const k of keys) if (r[k]?.length) log(`  ${k}: ${r[k].slice(0, 14).join(" || ")}`);
  log(`  fixed: ${r.fixed.join(" || ")}`);
  return r;
};
const ACTIVE = `(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + ' ' + (a.getAttribute('aria-label') || a.textContent || '').replace(/[\\n\\t ]+/g,' ').trim().slice(0,40) + (a.closest('[role=dialog]') ? ' [in dialog]' : ''); })()`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errs.push("[pageerror] " + e.message.slice(0, 200)));

  // ---- commerce: product -> cart -> checkout
  const S = "http://demo-shop.localhost:3000";
  await page.goto(S + "/products/sofa-throw", { waitUntil: "networkidle" });
  await run(page, "shop product 390 (top)");
  const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
  for (let i = 0; i < (await btns.count()); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
  await page.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => log("no toast"));
  await page.waitForTimeout(1500);
  await page.goto(S + "/cart", { waitUntil: "networkidle" });
  await run(page, "shop cart 390 with item");
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await page.waitForTimeout(400);
  await run(page, "shop cart 390 bottom", { tap: false, contrast: false });
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-cart-390.png" });
  await page.goto(S + "/checkout", { waitUntil: "networkidle" });
  await run(page, "shop checkout 390 with item");
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await page.waitForTimeout(400);
  await run(page, "shop checkout 390 bottom", { tap: false, contrast: false });
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-checkout-390-bottom.png" });
  // empty-submit: are errors announced / associated?
  const submit = page.locator('main form button[type="submit"]').last();
  log("checkout submit:", await submit.innerText().catch(() => "none"));
  await submit.click().catch(() => {});
  await page.waitForTimeout(1200);
  const inv = await page.evaluate(`[...document.querySelectorAll('main input, main textarea, main select')].filter(i => i.matches(':invalid') || i.getAttribute('aria-invalid') === 'true').map(i => (i.name || i.id) + ' aria-invalid=' + i.getAttribute('aria-invalid') + ' describedby=' + i.getAttribute('aria-describedby') + ' required=' + i.required)`);
  log("after empty submit, invalid fields:", JSON.stringify(inv), "active:", await page.evaluate(ACTIVE));

  // ---- restaurant: /order sheets
  const R = "http://demo-restaurant.localhost:3000";
  await page.goto(R + "/order", { waitUntil: "networkidle" });
  await run(page, "restaurant order 390");
  // keyboard: focus first item card and press Enter
  const card = page.locator("main button[aria-label]").filter({ hasText: /./ }).first();
  await card.focus();
  log("focused card:", await page.evaluate(ACTIVE));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  const d = await page.evaluate(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const r = d.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, title: (d.querySelector('h2')||{}).textContent }; })()`);
  log("modifier sheet:", JSON.stringify(d), "focus:", await page.evaluate(ACTIVE));
  await run(page, "restaurant modifier sheet open", { tap: true, contrast: false });
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-modsheet-390.png" });
  let left = 0;
  for (let i = 0; i < 20; i++) { await page.keyboard.press("Tab"); if (!String(await page.evaluate(ACTIVE)).includes("[in dialog]")) left++; }
  log("tabs leaving modifier sheet:", left);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  log("after Esc: dialogs=", await page.locator("[role=dialog]").count(), "focus:", await page.evaluate(ACTIVE));
  // add an item via the sheet and open the cart bar
  await card.click();
  await page.waitForTimeout(700);
  const addBtn = page.locator("[role=dialog] button").filter({ hasText: /เพิ่ม/ }).last();
  log("sheet add button:", await addBtn.innerText().catch(() => "none"));
  await addBtn.click().catch(() => {});
  await page.waitForTimeout(900);
  await run(page, "restaurant order with cart bar", { tap: true, contrast: false });
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await page.waitForTimeout(400);
  await run(page, "restaurant order bottom with cart bar", { tap: false, contrast: false });
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-cartbar-390-bottom.png" });
  const bar = page.locator("main button").filter({ hasText: /ออเดอร์|฿/ }).last();
  await bar.click().catch(() => {});
  await page.waitForTimeout(800);
  await run(page, "restaurant cart sheet", { tap: true, contrast: false });
  log("cart sheet focus:", await page.evaluate(ACTIVE));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  log("after closing cart sheet with Esc, focus:", await page.evaluate(ACTIVE));
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-cartsheet-390.png" });
  log("\nconsole errors:", JSON.stringify([...new Set(errs)].slice(0, 10)));
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
