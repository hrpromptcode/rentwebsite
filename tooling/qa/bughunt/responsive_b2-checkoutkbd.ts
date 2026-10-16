import "../../load-env";
import { chromium } from "@playwright/test";
import { origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: guest checkout at 390, submit the empty form with Enter: where is focus, what is announced, where does the next Tab go? */
const ACT = `(() => { const el = document.activeElement; if (!el || el === document.body) return "body"; const r = el.getBoundingClientRect(); return el.tagName.toLowerCase() + "#" + el.id + " '" + (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30) + "' @y=" + Math.round(r.top); })()`;
async function main() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, 390, "no-preference");
  const page = await ctx.newPage();
  await gotoRetry(page, origin("demo-shop") + "/products/sofa-throw");
  await page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first().click();
  await page.waitForTimeout(3000);
  await gotoRetry(page, origin("demo-shop") + "/checkout");
  await page.waitForTimeout(2000);
  const submit = page.locator("button[type=submit]:visible").filter({ hasText: /สั่งซื้อ/ }).last();
  await submit.focus();
  console.log("before:", await page.evaluate(ACT));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4000);
  const st = await page.evaluate(`(() => ({ alert: [...document.querySelectorAll("[role=alert]")].map(a => (a.textContent||"").trim().slice(0, 80)), invalid: [...document.querySelectorAll("[aria-invalid=true]")].map(e => e.id + (e.getAttribute("aria-describedby") ? "->" + e.getAttribute("aria-describedby") : "")), scrollY: Math.round(scrollY) }))()`);
  console.log("after submit:", await page.evaluate(ACT), JSON.stringify(st));
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Tab"); console.log(`  Tab ${i + 1}:`, await page.evaluate(ACT)); }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
