import { launch, newCtx, newPage, out, readCreds, store } from "./admin_b2-lib";
const target = process.argv[2] ?? readCreds().tenants.find((t: any) => t.key === "shop").slug;
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await newPage(ctx);
  const base = store(target);
  await page.goto(`${base}/products`, { waitUntil: "networkidle", timeout: 120_000 });
  const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
  for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
  await page.waitForTimeout(2000);
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const i = main.indexOf("นครศ");
  out("checkout after address", main.slice(main.indexOf("รหัสไปรษณีย์") - 10, main.indexOf("รหัสไปรษณีย์") + 900));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
