import { launch, newCtx, newPage, out, readCreds, shot, store } from "./admin_b2-lib";
const target = process.argv[2] ?? readCreds().tenants.find((t: any) => t.key === "shop").slug;
async function visible(page: any, sel: any) { const n = await sel.count(); for (let i = 0; i < n; i++) if (await sel.nth(i).isVisible()) return sel.nth(i); return null; }
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await newPage(ctx);
  const base = store(target);
  await page.goto(`${base}/products`, { waitUntil: "networkidle", timeout: 120_000 });
  const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  const add = await visible(page, page.getByRole("button", { name: "เพิ่มลงตะกร้า" }));
  if (!add) throw new Error("no add-to-cart");
  // pick first variant chips if any are required
  const chips = page.locator("button[aria-pressed=false]");
  if (await chips.count()) await chips.first().click().catch(() => {});
  await add.click();
  await page.waitForTimeout(2000);
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const payIdx = main.search(/ชำระเงิน|วิธีชำระ/);
  out("checkout payment area", main.slice(Math.max(0, payIdx - 50), payIdx + 600));
  const radios = await page.locator('input[name="paymentMethod"]').evaluateAll((els) => els.map((e: any) => `${e.value}${e.disabled ? "(disabled)" : ""}`));
  out("payment radios", radios);
  await page.screenshot({ path: shot(`checkout-new-${target}`), fullPage: true });
  // try to place a PromptPay order
  await page.fill("#name", "คุณทดสอบ บีทู").catch(() => {});
  await page.fill("#phone", "0899990001").catch(() => {});
  await page.fill("#line1", "1 ถนนทดสอบ").catch(() => {});
  await page.fill("#subdistrict", "คลองเตย").catch(() => {});
  await page.fill("#district", "คลองเตย").catch(() => {});
  await page.selectOption("#province", { index: 1 }).catch(() => {});
  await page.fill("#postalCode", "10110").catch(() => {});
  const pp = page.getByText("สแกน PromptPay", { exact: true }).first();
  if (await pp.count()) await pp.click().catch(() => {});
  const btn = await visible(page, page.locator('button[type="submit"]'));
  out("submit button", btn ? { text: await btn.innerText(), disabled: await btn.isDisabled() } : null);
  if (btn && !(await btn.isDisabled())) {
    await btn.click();
    await page.waitForTimeout(8000);
    out("after submit url", page.url().replace(/k=[^&]+/, "k=..."));
    const t = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    out("after submit text", t.slice(0, 700));
    await page.screenshot({ path: shot(`checkout-new-${target}-after`), fullPage: true });
  }
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
