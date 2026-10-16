import { launch, newCtx, newPage, out, readCreds, shot, store } from "./admin_b2-lib";
const T = Object.fromEntries(readCreds().tenants.map((t: any) => [t.key, t.slug]));
async function txt(page: any) { return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " "); }
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await newPage(ctx);
  // cafe checkout
  {
    const base = store(T.cafe);
    await page.goto(`${base}/products`, { waitUntil: "networkidle", timeout: 120_000 });
    const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
    await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
    const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
    await page.waitForTimeout(2000);
    await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
    const m = await txt(page);
    const k = m.indexOf("วิธีชำระเงิน");
    out("cafe checkout payment", k >= 0 ? m.slice(k, k + 300) : m.slice(0, 400));
    out("cafe radios", await page.locator('input[name="paymentMethod"]').evaluateAll((els) => els.map((e: any) => e.value)));
    await page.screenshot({ path: shot("checkout-new-cafe"), fullPage: true });
  }
  // salon /book
  {
    const base = store(T.salon);
    await page.goto(`${base}/book`, { waitUntil: "networkidle", timeout: 120_000 });
    out("salon /book", (await txt(page)).slice(0, 500));
    await page.screenshot({ path: shot("book-new-salon"), fullPage: true });
  }
  // clinic packages
  {
    const base = store(T.clinic);
    await page.goto(`${base}/packages`, { waitUntil: "networkidle", timeout: 120_000 });
    const href = await page.locator('a[href*="/buy"]').first().getAttribute("href").catch(() => null);
    out("clinic package buy href", href);
    if (href) { await page.goto(`${base}${href}`, { waitUntil: "networkidle" }); out("clinic buy page", (await txt(page)).slice(0, 700)); await page.screenshot({ path: shot("pkg-new-clinic"), fullPage: true }); }
  }
  // restaurant /order (pickup)
  {
    const base = store(T.restaurant);
    await page.goto(`${base}/order`, { waitUntil: "networkidle", timeout: 120_000 });
    out("restaurant /order", (await txt(page)).slice(0, 400));
  }
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
