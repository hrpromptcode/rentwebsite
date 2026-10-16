import "../../load-env";
import { chromium, type Browser, type Page } from "@playwright/test";

/** Customer account + OTP + open-redirect + takeover checks (storefront_shop bughunt).
 *   tsx qa/bughunt/storefront_shop-account.ts <tenant> <basic|takeover|otp|all>
 */
const SLUG = process.argv[2] ?? "demo-cafe";
const ORIGIN = `http://${SLUG}.localhost:3000`;
const log = (...a: unknown[]) => console.log(...a);
const rnd = () => String(Date.now()).slice(-8);

async function ctxPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "th-TH", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
  page.on("response", (r) => {
    if (r.status() >= 400) errs.push(`http${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`);
  });
  // never actually leave to an external host
  await ctx.route(/^https?:\/\/(www\.)?example\.(com|org)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>EXTERNAL</title>EXTERNAL" }));
  return { ctx, page, errs };
}

async function requestCode(page: Page, target: string): Promise<string | null> {
  await page.fill("#otp-target", target);
  await page.locator('form button[type="submit"]').first().click();
  const codeEl = page.locator("span.font-mono").first();
  const err = page.locator("p.text-destructive").first();
  await Promise.race([codeEl.waitFor({ timeout: 20_000 }), err.waitFor({ timeout: 20_000 })]).catch(() => {});
  if (await err.isVisible().catch(() => false)) {
    log("   request error:", await err.textContent());
    return null;
  }
  return (await codeEl.textContent())?.trim() ?? null;
}
async function submitCode(page: Page, code: string, name?: string) {
  await page.fill("#otp-code", code);
  if (name) await page.fill("#otp-name", name);
  await page.locator('form button[type="submit"]').first().click();
}
async function login(page: Page, target: string, name?: string, next?: string) {
  await page.goto(`${ORIGIN}/account/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "networkidle", timeout: 90_000 });
  const code = await requestCode(page, target);
  if (!code) throw new Error("no dev code");
  await submitCode(page, code, name);
  await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function addCart(page: Page, productId: string, qty = 1) {
  return page.evaluate(
    async ([pid, q]) => {
      const r = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: pid, quantity: q }) });
      return { status: r.status, body: await r.json() };
    },
    [productId, qty] as const,
  );
}
async function checkout(page: Page, contact: { name: string; phone: string; email?: string }) {
  await page.goto(`${ORIGIN}/checkout`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.fill("#name", contact.name);
  await page.fill("#phone", contact.phone);
  if (contact.email) await page.fill("#email", contact.email);
  await page.getByText("สแกน PromptPay", { exact: true }).first().click();
  const btns = page.locator('button[type="submit"]', { hasText: "สั่งซื้อและชำระเงิน" });
  for (let i = 0; i < (await btns.count()); i++)
    if (await btns.nth(i).isVisible()) {
      await btns.nth(i).click();
      break;
    }
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await page.waitForLoadState("networkidle");
  const h1 = ((await page.locator("h1").first().textContent()) ?? "").trim();
  return { url: page.url(), number: h1.match(/#\d+/)?.[0] ?? h1 };
}

async function main() {
  const browser = await chromium.launch();
  const PRODUCT = process.env.PID ?? "01a14029-1dff-7328-adef-00aaaeeae8d3"; // demo-cafe latte (stock 100)
  const sec = process.argv[3] ?? "all";

  if (sec === "all" || sec === "basic") {
    log("== A. basic account flow ==");
    const { ctx, page, errs } = await ctxPage(browser);
    let r = await page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle", timeout: 90_000 });
    log("A1 /account (anon) ->", page.url().replace(ORIGIN, ""), r?.status());
    r = await page.goto(`${ORIGIN}/account/orders`, { waitUntil: "networkidle", timeout: 90_000 });
    log("A2 /account/orders (anon) ->", page.url().replace(ORIGIN, ""), "| title:", await page.title());
    await page.fill("#otp-target", "abc");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(400);
    const vmsg = await page.locator("p.text-destructive").first().textContent({ timeout: 10_000 }).catch(() => null);
    log("A3 invalid target error:", vmsg);
    const phone = `08${rnd()}`;
    await page.goto(`${ORIGIN}/products`, { waitUntil: "networkidle" });
    const add = await addCart(page, PRODUCT, 1);
    log("A4 cart add before login:", add.status, add.body?.cart?.itemCount);
    await page.goto(`${ORIGIN}/account/login?next=${encodeURIComponent("/account/orders")}`, { waitUntil: "networkidle" });
    const code = await requestCode(page, phone);
    log("A5 dev code shown:", !!code);
    await submitCode(page, code === "000000" ? "111111" : "000000");
    await page.waitForTimeout(1500);
    log("A6 wrong code msg:", await page.locator("p.text-destructive").first().textContent().catch(() => null));
    await submitCode(page, code!, "ลูกค้า ทดสอบ");
    await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 30_000 }).catch(() => {});
    log("A7 after verify ->", page.url().replace(ORIGIN, ""));
    await page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle" });
    log("A8 /account h1:", await page.locator("h1").first().textContent(), "| links:", await page.locator("a.card").evaluateAll((els) => els.map((e) => e.getAttribute("href"))), "| title:", await page.title());
    const cartRes = await page.evaluate(async () => (await (await fetch("/api/cart")).json()).cart.itemCount);
    log("A9 cart itemCount after login:", cartRes);
    const o = await checkout(page, { name: "ลูกค้า ทดสอบ", phone });
    log("A10 order placed:", o.number);
    await page.goto(`${ORIGIN}/account/orders`, { waitUntil: "networkidle" });
    const list = await page.locator('a[href^="/orders/"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("href")} ${e.textContent?.replace(/\s+/g, " ").slice(0, 90)}`));
    log("A11 orders list:", list, "| title:", await page.title());
    if (list[0]) {
      await page.goto(`${ORIGIN}${list[0].split(" ")[0]}`, { waitUntil: "networkidle" });
      log("A12 order detail h1:", await page.locator("h1").first().textContent(), "| title:", await page.title());
    }
    await page.goto(`${ORIGIN}/account/login?next=${encodeURIComponent("/account/orders")}`, { waitUntil: "networkidle" });
    log("A13 /account/login when logged in ->", page.url().replace(ORIGIN, ""));
    await page.goto(`${ORIGIN}/account/login?next=${encodeURIComponent("https://example.com/phish")}`, { waitUntil: "load" }).catch((e) => log("   nav err", (e as Error).message.slice(0, 80)));
    log("A14 logged-in /account/login?next=https://example.com/phish ->", page.url());
    await page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /ออกจากระบบ/ }).first().click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 }).catch(() => {});
    log("A15 after logout ->", page.url().replace(ORIGIN, ""));
    await page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle" });
    log("A16 /account after logout ->", page.url().replace(ORIGIN, ""));
    const cartAfter = await page.evaluate(async () => (await (await fetch("/api/cart")).json()).cart.itemCount);
    log("A17 cart itemCount after logout:", cartAfter);
    log("A errors:", errs.slice(0, 8));
    await ctx.close();

    log("== B. open redirect via next on verify ==");
    const b = await ctxPage(browser);
    await login(b.page, `08${rnd()}`, undefined, "//example.com/phish");
    log("B1 verify with next=//example.com/phish ->", b.page.url());
    await b.ctx.close();
  }

  if (sec === "all" || sec === "takeover") {
    log("== C. account takeover via guest checkout email ==");
    const victimPhone = `08${rnd()}`;
    const v = await ctxPage(browser);
    await login(v.page, victimPhone, "เหยื่อ ทดสอบ");
    log("C1 victim logged in, at", v.page.url().replace(ORIGIN, ""));
    await v.page.goto(`${ORIGIN}/products`, { waitUntil: "networkidle" });
    await addCart(v.page, PRODUCT, 1);
    const vo = await checkout(v.page, { name: "เหยื่อ ทดสอบ", phone: victimPhone });
    log("C2 victim order:", vo.number);
    await v.ctx.close();

    const atkEmail = `attacker+${rnd()}@example.org`;
    const a = await ctxPage(browser);
    await a.page.goto(`${ORIGIN}/products`, { waitUntil: "networkidle" });
    await addCart(a.page, PRODUCT, 1);
    const ao = await checkout(a.page, { name: "ผู้โจมตี", phone: victimPhone, email: atkEmail });
    log("C3 attacker guest order with victim phone + own email:", ao.number);
    await login(a.page, atkEmail, undefined, "/account/orders");
    log("C4 attacker logged in by email, at", a.page.url().replace(ORIGIN, ""));
    await a.page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle" });
    log("C5 attacker /account h1:", (await a.page.locator("h1").first().textContent())?.trim(), "|", (await a.page.locator("h1 + p").first().textContent().catch(() => ""))?.trim());
    await a.page.goto(`${ORIGIN}/account/orders`, { waitUntil: "networkidle" });
    const list = await a.page.locator('a[href^="/orders/"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("href")} ${e.textContent?.replace(/\s+/g, " ").slice(0, 60)}`));
    log("C6 attacker sees orders:", list);
    const victimRow = list.find((l) => l.includes(vo.number));
    if (victimRow) {
      await a.page.goto(`${ORIGIN}${victimRow.split(" ")[0]}`, { waitUntil: "networkidle" });
      const body = (await a.page.locator("main").first().innerText()).replace(/\s+/g, " ");
      log("C7 attacker opened victim order:", body.slice(0, 400));
    }
    log("C errors:", a.errs.slice(0, 5));
    await a.ctx.close();
    log("victimPhone", victimPhone, "atkEmail", atkEmail);
  }

  if (sec === "all" || sec === "otp") {
    log("== D. OTP brute-force limits ==");
    const d = await ctxPage(browser);
    const phone = `08${rnd()}`;
    for (let round = 1; round <= 2; round++) {
      await d.page.goto(`${ORIGIN}/account/login`, { waitUntil: "networkidle" });
      const code = await requestCode(d.page, phone);
      const msgs: string[] = [];
      for (let i = 0; i < 6; i++) {
        const wrong = String((Number(code) + 1 + i) % 1_000_000).padStart(6, "0");
        await submitCode(d.page, wrong);
        await d.page.waitForTimeout(1200);
        msgs.push((await d.page.locator("p.text-destructive").first().textContent().catch(() => "?")) ?? "?");
        if (!(await d.page.locator("#otp-code").count())) break;
      }
      log(`D round ${round}: wrong-code msgs`, msgs);
    }
    const t0 = Date.now();
    let ok = 0;
    for (let i = 0; i < 8; i++) {
      await d.page.goto(`${ORIGIN}/account/login`, { waitUntil: "networkidle" });
      if (await requestCode(d.page, phone)) ok++;
    }
    log(`D3 ${ok}/8 back-to-back OTP requests for the same phone succeeded in ${Date.now() - t0}ms`);
    await d.ctx.close();
    log("otpPhone", phone);
  }
  if (sec === "merge") {
    log("== E. cart across devices for the same customer ==");
    const phone = `08${rnd()}`;
    const a = await ctxPage(browser);
    await login(a.page, phone, "ลูกค้า สองเครื่อง");
    await a.page.goto(`${ORIGIN}/products`, { waitUntil: "networkidle" });
    const add = await addCart(a.page, PRODUCT, 2);
    log("E1 device A logged in, cart itemCount:", add.body?.cart?.itemCount);
    const b = await ctxPage(browser);
    await b.page.goto(`${ORIGIN}/products`, { waitUntil: "networkidle" });
    const addB = await addCart(b.page, "01a14029-1dff-7328-adee-e79d8d5afb26", 1);
    log("E2 device B guest cart itemCount:", addB.body?.cart?.itemCount);
    await login(b.page, phone);
    const cb = await b.page.evaluate(async () => (await (await fetch("/api/cart")).json()).cart);
    log("E3 device B after login, cart lines:", cb.items.map((i: { name: string; quantity: number }) => i.name + " x" + i.quantity));
    const ca = await a.page.evaluate(async () => (await (await fetch("/api/cart")).json()).cart);
    log("E4 device A cart lines:", ca.items.map((i: { name: string; quantity: number }) => i.name + " x" + i.quantity));
    await a.ctx.close(); await b.ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
