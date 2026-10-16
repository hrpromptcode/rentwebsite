import { desc, eq, payments } from "@rentweb/db";
import { done, launch, newCtx, out, readCreds, shot, store, tenantIdOf, tt } from "./admin_b2-lib";
const SHOP = process.argv[2] ?? readCreds().tenants.find((t: any) => t.key === "shop").slug;
export async function toCheckout(page: any, base: string) {
  await page.goto(`${base}/products`, { waitUntil: "networkidle", timeout: 120_000 });
  const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
    await page.waitForTimeout(3000);
    await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
    if (await page.locator("#name").count()) return true;
  }
  return false;
}
async function order(browser: any, method: string) {
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const base = store(SHOP);
  if (!(await toCheckout(page, base))) return "could not reach checkout: " + page.url();
  await page.fill("#name", "คุณทดสอบ บีทู"); await page.fill("#phone", "0899990004");
  await page.fill("#line1", "1 ถนนทดสอบ"); await page.fill("#subdistrict", "คลองเตย"); await page.fill("#district", "คลองเตย");
  await page.selectOption("#province", { index: 1 }); await page.fill("#postalCode", "10110");
  await page.locator(`input[name="paymentMethod"][value="${method}"]`).check({ force: true });
  const sub = page.locator('button[type="submit"]', { hasText: "สั่งซื้อ" });
  for (let i = 0; i < await sub.count(); i++) if (await sub.nth(i).isVisible()) { await sub.nth(i).click(); break; }
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 90_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: shot(`order-${method}`), fullPage: true });
  await ctx.close();
  return t.slice(0, 650);
}
async function main() {
  const tid = await tenantIdOf(SHOP);
  const browser = await launch();
  out("promptpay order page", await order(browser, "promptpay_qr"));
  const [p] = await tt(tid, (tx) => tx.select({ method: payments.method, qr: payments.qrPayload }).from(payments).where(eq(payments.tenantId, tid)).orderBy(desc(payments.createdAt)).limit(1));
  out("payment", p);
  out("slip order page", await order(browser, "slip"));
  await browser.close();
  await done();
}
if (process.argv[1]?.includes("admin_b2-co4")) main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
