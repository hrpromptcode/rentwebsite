import { launch, newCtx, out, readCreds, shot, store } from "./admin_b2-lib";
const SHOP = process.argv[2] ?? readCreds().tenants.find((t: any) => t.key === "shop").slug;
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
  const base = store(SHOP);
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 120_000 });
  out("home LINE anchors", await page.locator('a[href*="line.me"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") + " | " + (e.textContent ?? "").trim().slice(0, 30))));
  await page.goto(`${base}/products`, { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
  out("add buttons", await btns.count());
  for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
  await page.waitForTimeout(2500);
  const r = await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  out("checkout status/url", { s: r?.status(), url: page.url() });
  const main = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  out("checkout text", main.slice(0, 300));
  out("radios", await page.locator('input[name="paymentMethod"]').evaluateAll((els) => els.map((e: any) => e.value)));
  await page.screenshot({ path: shot("co3"), fullPage: false });
  out("errs", errs);
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
