import "../../load-env";
import { chromium, type Page } from "@playwright/test";

/** Catalog / search / empty states / stock / cart persistence / 404 checks (storefront_shop bughunt). */
const log = (...a: unknown[]) => console.log(...a);
const T = (s: string) => s.replace(/\s+/g, " ").trim();

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "th-TH", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(`${page.url().replace(/^http:\/\/[^/]+/, "")} :: ${m.text().slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== "document") errs.push(`${page.url().replace(/^http:\/\/[^/]+/, "")} :: http${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`);
  });
  const O = "http://demo-shop.localhost:3000";
  const go = async (p: string, origin = O) => {
    const r = await page.goto(origin + p, { waitUntil: "networkidle", timeout: 90_000 });
    return r?.status() ?? 0;
  };
  const mainText = async () => T((await page.locator("main").first().innerText().catch(async () => page.locator("body").innerText())) ?? "");
  const cards = async () => page.locator("article").count();

  // --- listing edge cases
  for (const p of ["/products?q=zzzzqqq", "/products?page=2", "/products?page=abc", "/products?page=-1", "/products?min=abc&max=-5", "/products?sort=bogus", "/products?q=%25", "/products?q=_", "/products?category=bogus", "/products?min=1000&max=500", "/collections/bogus-cat", "/products/bogus-product", "/this-route-does-not-exist", "/products/%E0%B8%9E"]) {
    const s = await go(p);
    const txt = await mainText();
    log(`${s} ${p} | cards=${await cards()} | title="${await page.title()}" | ${txt.slice(0, 160)}`);
  }
  // price sort correctness (compare displayed first price with list)
  for (const sort of ["price_asc", "price_desc"]) {
    await go(`/products?sort=${sort}`);
    const prices = await page.locator("article").evaluateAll((els) =>
      els.map((e) => {
        const m = (e.textContent ?? "").match(/฿([\d,]+)/);
        return m ? Number(m[1]!.replace(/,/g, "")) : -1;
      }),
    );
    log(`sort ${sort}: ${prices.join(",")}`);
  }
  // --- product page: variant without stock
  await go("/products/linen-shirt-sand");
  const opts = await page.locator("button[aria-pressed]").evaluateAll((els) => els.map((e) => `${e.textContent?.trim()}:${(e as HTMLButtonElement).disabled ? "disabled" : "enabled"}:${e.getAttribute("aria-pressed")}`));
  log("linen variants:", opts.join(" "));
  const m = page.locator("button[aria-pressed]", { hasText: /^M$/ }).first();
  if (await m.isEnabled()) await m.click();
  await page.waitForTimeout(500);
  const addBtns = await page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled));
  log("after M (stock 0): add buttons disabled=", addBtns, "| stock line:", T((await page.locator("p.text-sm").filter({ hasText: /หมด|ไม่มี|เหลือ/ }).first().textContent().catch(() => "")) ?? ""));
  // max quantity on product page: XL stock 3
  const xl = page.locator("button[aria-pressed]", { hasText: /^XL$/ }).first();
  await xl.click();
  await page.waitForTimeout(300);
  const plus = page.locator('button[aria-label="เพิ่มจำนวน"]').first();
  for (let i = 0; i < 5; i++) if (await plus.isEnabled()) await plus.click();
  const qty = await page.locator('input[aria-label="จำนวน"]').first().inputValue();
  log(`XL (stock 3) after 5x plus: qty=${qty}, plus enabled=${await plus.isEnabled()}`);
  const qtyInput = page.locator('input[aria-label="จำนวน"]').first();
  await qtyInput.fill("50");
  await qtyInput.blur();
  await page.waitForTimeout(300);
  log(`XL typed 50 -> qty=${await qtyInput.inputValue()}`);

  // --- cart API caps + persistence
  const api = (method: string, body?: unknown, qs = "") =>
    page.evaluate(
      async ([mth, b, q]) => {
        const r = await fetch(`/api/cart${q}`, { method: mth, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      [method, body, qs] as const,
    );
  await api("DELETE");
  const clutch = "01a14029-094f-7368-8295-185356276cca"; // stock 18
  const a1 = await api("POST", { productId: clutch, quantity: 99 });
  log(`add clutch x99 (stock 18): ${a1.status} qty=${a1.body?.cart?.items?.[0]?.quantity} adjusted=${a1.body?.adjusted}`);
  const a2 = await api("POST", { productId: clutch, quantity: 1 });
  log(`add clutch +1 at cap: ${a2.status} ${JSON.stringify(a2.body).slice(0, 140)}`);
  const lineId = a1.body?.cart?.items?.[0]?.id;
  const p1 = await api("PATCH", { itemId: lineId, quantity: 50 });
  log(`patch qty 50: ${p1.status} qty=${p1.body?.cart?.items?.[0]?.quantity} adjusted=${p1.body?.adjusted}`);
  const p2 = await api("PATCH", { itemId: lineId, quantity: 2 });
  log(`patch qty 2: ${p2.status} qty=${p2.body?.cart?.items?.[0]?.quantity}`);
  const a3 = await api("POST", { productId: "01a143a3-7177-743f-aa0e-b59f360bf594", variantId: "01a143a3-71bb-736c-ba5f-2b314bb95d73", quantity: 1 });
  log(`add NKOVY S (stock 0): ${a3.status} ${JSON.stringify(a3.body).slice(0, 120)}`);
  const a4 = await api("POST", { productId: "01a14029-06cd-716b-b0d6-fe941a26ebc0", quantity: 1 });
  log(`add linen without variant: ${a4.status} ${JSON.stringify(a4.body).slice(0, 120)}`);
  await go("/cart");
  const before = await page.locator('input[aria-label="จำนวน"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.locator('input[aria-label="จำนวน"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const badge = T((await page.locator('header a[href="/cart"]').first().textContent()) ?? "");
  log(`cart persistence: before reload ${before} after reload ${after} badge="${badge}"`);
  const p2nd = await ctx.newPage();
  await p2nd.goto(O + "/cart", { waitUntil: "networkidle" });
  log(`cart in new tab: ${await p2nd.locator('input[aria-label="จำนวน"]').count()} lines`);
  await p2nd.close();
  // cart isolation across tenants: same cookie name on another tenant host
  await go("/cart", "http://demo-cafe.localhost:3000");
  log(`demo-cafe cart lines with shop cookie: ${await page.locator('input[aria-label="จำนวน"]').count()}`);
  await go("/cart");
  // empty cart state
  await api("DELETE");
  await go("/cart");
  log(`empty cart: ${(await mainText()).slice(0, 160)}`);
  await go("/checkout");
  log(`checkout with empty cart -> ${page.url().replace(O, "")} | ${(await mainText()).slice(0, 120)}`);

  // corporate (no commerce) module routes
  for (const p of ["/products", "/cart", "/checkout", "/account", "/account/orders", "/orders/track", "/api/cart"]) {
    const s = await go(p, "http://demo-corporate.localhost:3000");
    log(`corporate ${p} -> ${s} ${page.url().replace("http://demo-corporate.localhost:3000", "")} | ${(await mainText()).slice(0, 100)}`);
  }
  log("ERRORS:", errs);
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
