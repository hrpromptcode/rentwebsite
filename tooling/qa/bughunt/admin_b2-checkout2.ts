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
  // reverify-repro 2026-10-17 (ADMIN_B2-05 intended): with no PromptPay / bank account the first payable delivery option
  // (COD) is preselected, and choosing a prepaid-only option says the SHOP has not set up payments (not "pick another shipping")
  const payText = async () => { const m = (await page.locator("main").innerText()).replace(/\s+/g, " "); const k = m.indexOf("วิธีชำระเงิน"); return m.slice(k, k + 260); };
  const initial = await payText();
  out("payment area initially", initial);
  await page.getByText(/Flash Express/).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const flash = await payText();
  out("payment area after choosing Flash Express", flash);
  const blamesShipping = /วิธีจัดส่งนี้ยังไม่มีช่องทางชำระเงินที่รองรับ/.test(initial + flash);
  const okInit = /ชำระแบบเก็บเงินปลายทางเท่านั้น|ร้านค้ายังไม่ได้ตั้งค่าช่องทางรับชำระเงิน/.test(initial); // COD preselected, or the no-receiver notice
  const okFlash = flash === initial || /ร้านค้ายังไม่ได้ตั้งค่าช่องทางรับชำระเงิน|ชำระแบบเก็บเงินปลายทางเท่านั้น/.test(flash);
  console.log(/สแกน PromptPay|โอนเงินผ่านธนาคาร/.test(initial) ? "SKIP ADMIN_B2-05 this shop already has a payment receiver (precondition gone)" : okInit && okFlash && !blamesShipping ? "PASS ADMIN_B2-05 no receiver: COD preselected / 'shop has not set up payments' notice, never blames the shipping method" : `FAIL ADMIN_B2-05 initial=${okInit} flash=${okFlash} blamesShipping=${blamesShipping}`);
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
