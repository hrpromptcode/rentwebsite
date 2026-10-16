import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ADMIN, chromium, collectErrors, loginState, shot, shotsDir, type Page } from "./admin_modules-lib";
const SHOP = "http://demo-shop.localhost:3000";
const stamp = Date.now().toString(36).toUpperCase().slice(-5);
const txt = async (p: Page, sel = "main") => ((await p.locator(sel).first().innerText().catch(() => "")) ?? "").replace(/\s+/g, " ");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
async function clickVisible(page: Page, name: string | RegExp) {
  const btns = page.getByRole("button", { name });
  const n = await btns.count();
  for (let i = 0; i < n; i++) if (await btns.nth(i).isVisible()) return btns.nth(i).click();
  throw new Error(`no visible button ${name}`);
}
async function main() {
  const only = process.argv[2] ?? "all";
  const browser = await chromium.launch();
  const st = await loginState(browser);
  const actx = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 900 } });
  const a = await actx.newPage();
  const errs: string[] = [];
  collectErrors(a, errs);
  const wctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const w = await wctx.newPage();
  collectErrors(w, errs);

  if (only === "all" || only === "prod") {
    const name = `QA AM สินค้า ${stamp}`;
    await a.goto(`${ADMIN}/t/demo-shop/products/new`, { waitUntil: "networkidle", timeout: 120_000 });
    await a.fill("#p-name", name);
    await a.fill("#p-price", "123");
    await a.fill("#p-sku", `QA-AM-${stamp}`);
    await a.fill("#p-stock", "3");
    await a.getByRole("button", { name: "บันทึกและเผยแพร่" }).click();
    await a.waitForURL(/\/products\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const slug = (await a.inputValue("#p-slug")).trim();
    console.log("created product", a.url(), "slug", slug);
    const purl = `${SHOP}/products/${encodeURIComponent(slug)}`;
    let r = await w.goto(purl, { waitUntil: "networkidle", timeout: 120_000 });
    let body = await txt(w);
    console.log("storefront before:", r?.status(), "has ฿123:", body.includes("฿123"), "addBtn:", await w.getByRole("button", { name: "เพิ่มลงตะกร้า" }).count());
    // edit price + stock
    await a.fill("#p-price", "456");
    await a.fill("#p-stock", "0");
    await a.getByRole("button", { name: "บันทึก", exact: true }).click();
    await a.getByText(/บันทึก.*แล้ว/).first().waitFor({ timeout: 20_000 }).catch(() => console.log("no save toast"));
    await a.waitForTimeout(500);
    r = await w.goto(purl, { waitUntil: "networkidle", timeout: 120_000 });
    body = await txt(w);
    const addBtn = w.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    console.log("storefront after edit:", r?.status(), "has ฿456:", body.includes("฿456"), "has ฿123:", body.includes("฿123"), "addBtn count:", await addBtn.count(), "disabled:", (await addBtn.count()) ? await addBtn.first().isDisabled() : "-", "soldout text:", /หมด/.test(body));
    await w.screenshot({ path: shot("prod-after-edit") });
    // listing
    await w.goto(`${SHOP}/products?q=${encodeURIComponent(`QA AM สินค้า ${stamp}`)}`, { waitUntil: "networkidle", timeout: 120_000 });
    console.log("listing shows product:", (await w.getByText(name).count()) > 0, "listing price 456:", (await txt(w)).includes("฿456"));
    // hide
    await a.getByRole("button", { name: "ซ่อนจากหน้าร้าน" }).click();
    await a.getByText(/บันทึก|ซ่อน/).first().waitFor({ timeout: 20_000 }).catch(() => {});
    await a.waitForTimeout(1500);
    r = await w.goto(purl, { waitUntil: "networkidle", timeout: 120_000 });
    console.log("storefront after hide:", r?.status(), (await txt(w)).slice(0, 120));
    await w.goto(`${SHOP}/products?q=${encodeURIComponent(`QA AM สินค้า ${stamp}`)}`, { waitUntil: "networkidle", timeout: 120_000 });
    console.log("listing after hide shows product:", (await w.getByText(name).count()) > 0);
  }

  if (only === "all" || only === "order") {
    const phone = `08${String(Date.now()).slice(-8)}`;
    await w.goto(`${SHOP}/products/cushion-cover`, { waitUntil: "networkidle", timeout: 120_000 });
    const unit = (await txt(w, "main")).match(/฿[\d,]+/)?.[0];
    console.log("unit", unit); await w.screenshot({ path: shot("pdp-cushion") });
    await w.locator('button[aria-label="เพิ่มจำนวน"]').first().click({ timeout: 8000 }).catch((e) => console.log("plus fail", e.message.slice(0,200)));
    console.log("plus ok");
    w.on("response", async (r) => { if (r.request().method() === "POST") console.log("POST", r.url(), r.status(), (r.headers()["set-cookie"] ?? "").slice(0, 120)); });
    await clickVisible(w, "เพิ่มลงตะกร้า");
    await w.waitForTimeout(3000); await w.screenshot({ path: shot("pdp-after-add") });
    await w.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ timeout: 15_000 });
    await w.waitForTimeout(2500);
    console.log("badge:", await w.locator('header a[href="/cart"]').first().innerText().catch(() => "?"), "cookies:", (await wctx.cookies()).map((c) => c.name + "@" + c.domain).join(","));
    await w.goto(`${SHOP}/cart`, { waitUntil: "networkidle", timeout: 120_000 });
    console.log("cart:", (await txt(w)).slice(0, 300)); await w.goto(SHOP + "/checkout", { waitUntil: "networkidle", timeout: 120_000 });
    await w.waitForURL(/\/checkout/, { timeout: 30_000 });
    await w.waitForLoadState("networkidle");
    console.log("at checkout"); await w.getByText("Kerry Express", { exact: true }).first().click();
    await w.fill("#name", `คุณ AM ทดสอบ ${stamp}`);
    await w.fill("#phone", phone);
    await w.fill("#email", `qa-am-${stamp.toLowerCase()}@example.com`);
    await w.fill("#line1", `88/8 ซอย AM-${stamp} ถนนพระราม 4`);
    await w.fill("#subdistrict", "สีลม");
    await w.fill("#district", "บางรัก");
    await w.selectOption("#province", "กรุงเทพมหานคร");
    await w.fill("#postalCode", "10500");
    await w.getByText("สแกน PromptPay", { exact: true }).first().click();
    const sumTxt = await txt(w, "dl");
    const total = await w.locator("dl dd.font-heading").first().innerText();
    console.log("checkout summary:", sumTxt, "| total", total, "| unit", unit);
    const btns = w.locator('button[type="submit"]', { hasText: "สั่งซื้อและชำระเงิน" });
    for (let i = 0; i < (await btns.count()); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
    await w.waitForURL(/\/orders\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
    await w.waitForLoadState("networkidle");
    const h1 = await w.locator("h1").first().innerText();
    const number = h1.match(/#\d+/)?.[0] ?? "?";
    const slipPath = path.join(shotsDir, "_qa-slip.png");
    await writeFile(slipPath, PNG);
    await w.locator('input[type="file"]').first().setInputFiles(slipPath);
    await w.getByText("ชำระเงินสำเร็จ").first().waitFor({ timeout: 30_000 }).catch(() => console.log("no paid msg"));
    console.log("storefront order", number, w.url().replace(/k=.*/, "k=..."));
    await a.goto(`${ADMIN}/t/demo-shop/orders?q=${encodeURIComponent(number.replace("#", ""))}`, { waitUntil: "networkidle", timeout: 120_000 });
    const rowLink = a.locator("table tbody tr a, article a").filter({ hasText: number }).first();
    console.log("admin list row:", (await a.locator("table tbody tr").first().innerText().catch(() => "")).replace(/\s+/g, " "));
    await rowLink.click().catch(async () => { await a.locator("table tbody tr").first().click(); });
    await a.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await a.waitForLoadState("networkidle");
    const det = await txt(a, "main");
    console.log("admin detail:", det.slice(0, 1600));
    for (const needle of ["ปลอกหมอนผ้าฝ้ายทอ", `88/8 ซอย AM-${stamp}`, "สีลม", "บางรัก", "10500", phone, "Kerry", total.trim()]) console.log("  contains", needle, det.includes(needle) || det.includes(needle.replace(/^0/, "")));
    await a.screenshot({ path: shot("order-detail-from-storefront"), fullPage: true });
  }
  console.log("errors:", [...new Set(errs)].slice(0, 15));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e.message.split("\n")[0]); process.exit(1); });
