import { readFileSync } from "node:fs";
import { and, desc, eq, customers, orders } from "@rentweb/db";
import { anyToast, done, go, launch, newCtx, newPage, out, readCreds, shot, store, tenantIdOf, tt, ADMIN } from "./admin_b2-lib";
import { toCheckout } from "./admin_b2-co4";
const C = readCreds();
const SHOP = C.tenants.find((t: any) => t.key === "shop").slug as string;
const PHONE = "0899990004";
async function main() {
  const tid = await tenantIdOf(SHOP);
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const page = await newPage(ctx);
  await go(page, `/t/${SHOP}/customers?q=${PHONE}`);
  const rows = await page.locator("main table tbody tr, main ul li a[href*='/customers/']").count();
  out("search by phone rows", rows);
  await go(page, `/t/${SHOP}/customers?q=%27%22%3B--`);
  out("search sql-ish chars", { status: page.url(), body: (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120) });
  const [cust] = await tt(tid, (tx) => tx.select().from(customers).where(and(eq(customers.tenantId, tid), eq(customers.phone, PHONE))));
  out("customer row", { id: cust?.id, name: cust?.name, email: cust?.email, ordersCount: cust?.ordersCount, totalSpent: cust?.totalSpent });
  await go(page, `/t/${SHOP}/customers/${cust!.id}`);
  out("detail text", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 400));
  // reverify-repro 2026-10-17: unique tag/notes per run — re-running with the hunt's values leaves the form clean, so the
  // save button stays disabled (dirty tracking) and the click times out
  const RUN = Date.now().toString(36).slice(-4);
  await page.fill("#cust-tag", `QA-B2-Tag-${RUN}`);
  await page.keyboard.press("Enter");
  await page.fill("#cust-notes", `โน้ต QA B2 ${RUN} <script>x</script>`);
  out("save customer", await anyToast(page, () => page.getByRole("button", { name: /บันทึก/ }).last().click()));
  const [c2] = await tt(tid, (tx) => tx.select({ tags: customers.tags, notes: customers.notes, tier: customers.tier }).from(customers).where(eq(customers.id, cust!.id)));
  out("db after save", c2);
  out("block", await anyToast(page, () => page.getByRole("button", { name: /บล็อก/ }).first().click()));
  const [c3] = await tt(tid, (tx) => tx.select({ blockedAt: customers.blockedAt }).from(customers).where(eq(customers.id, cust!.id)));
  out("db blockedAt", c3);
  await page.screenshot({ path: shot("customer-detail-blocked") });
  // blocked customer: guest checkout with same phone
  const sctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const sp = await sctx.newPage();
  const base = store(SHOP);
  const ok = await toCheckout(sp, base);
  if (ok) {
    await sp.fill("#name", "คุณบล็อก แล้ว"); await sp.fill("#phone", PHONE);
    await sp.fill("#line1", "1 ถนนทดสอบ"); await sp.fill("#subdistrict", "คลองเตย"); await sp.fill("#district", "คลองเตย");
    await sp.selectOption("#province", { index: 1 }); await sp.fill("#postalCode", "10110");
    await sp.locator('input[name="paymentMethod"]').first().check({ force: true });
    const sub = sp.locator('button[type="submit"]', { hasText: "สั่งซื้อ" });
    for (let i = 0; i < await sub.count(); i++) if (await sub.nth(i).isVisible()) { await sub.nth(i).click(); break; }
    await sp.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 60_000 }).catch(() => {});
    out("blocked customer guest checkout ->", { url: sp.url().replace(/k=[^&]+/, "k=..."), text: (await sp.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160) });
    const [o] = await tt(tid, (tx) => tx.select({ number: orders.number, customerId: orders.customerId }).from(orders).where(eq(orders.tenantId, tid)).orderBy(desc(orders.createdAt)).limit(1));
    out("latest order", { ...o, sameBlockedCustomer: o?.customerId === cust!.id });
  }
  // blocked customer: OTP login
  await sp.goto(`${base}/account/login`, { waitUntil: "networkidle" });
  await sp.fill("#otp-target", PHONE);
  await sp.locator('button[type="submit"]').first().click();
  await sp.waitForTimeout(4000);
  const code = (await sp.locator("text=(โหมดพัฒนา)").innerText().catch(() => "")).match(/\d{6}/)?.[0];
  out("otp devCode", code ?? (await sp.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
  if (code) {
    await sp.fill("#otp-code", code);
    await sp.locator('button[type="submit"]').first().click();
    await sp.waitForTimeout(5000);
    out("blocked customer after OTP verify", { url: sp.url(), text: (await sp.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200) });
    await sp.screenshot({ path: shot("blocked-customer-login") });
  }
  // unblock
  await go(page, `/t/${SHOP}/customers/${cust!.id}`);
  out("unblock", await anyToast(page, () => page.getByRole("button", { name: /ปลดบล็อก/ }).first().click()));
  out("errors", page.__errors.slice(0, 4));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
