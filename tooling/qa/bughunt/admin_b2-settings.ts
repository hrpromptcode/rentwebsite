import { readFileSync } from "node:fs";
import { desc, eq, payments, tenants } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, plat, readCreds, shot, store, tenantIdOf, tt, type Browser, type Page } from "./admin_b2-lib";
const C = readCreds();
const SHOP = C.tenants.find((t: any) => t.key === "shop").slug as string;

async function checkout(browser: Browser, slug: string, method?: string) {
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const base = store(slug);
  await page.goto(`${base}/products`, { waitUntil: "networkidle", timeout: 120_000 });
  const href = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  const btns = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
  for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
  await page.waitForTimeout(2000);
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  const radios = await page.locator('input[name="paymentMethod"]').evaluateAll((els) => els.map((e: any) => e.value));
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const k = main.indexOf("วิธีชำระเงิน");
  const res: any = { radios, payText: main.slice(k, k + 160) };
  if (method && radios.includes(method)) {
    await page.fill("#name", "คุณทดสอบ บีทู"); await page.fill("#phone", "0899990004");
    await page.fill("#line1", "1 ถนนทดสอบ"); await page.fill("#subdistrict", "คลองเตย"); await page.fill("#district", "คลองเตย");
    await page.selectOption("#province", { index: 1 }); await page.fill("#postalCode", "10110");
    await page.locator(`input[name="paymentMethod"][value="${method}"]`).check({ force: true });
    const sub = page.locator('button[type="submit"]', { hasText: "สั่งซื้อ" });
    for (let i = 0; i < await sub.count(); i++) if (await sub.nth(i).isVisible()) { await sub.nth(i).click(); break; }
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 90_000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    res.orderText = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 700);
    res.qrImgs = await page.locator('img[alt*="QR"], svg[aria-label*="QR"], img[src^="data:image"]').count();
    await page.screenshot({ path: shot(`settings-order-${method}`), fullPage: true });
  }
  await ctx.close();
  return res;
}

async function main() {
  const tid = await tenantIdOf(SHOP);
  const browser = await launch();
  const st = JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8"));
  const ctx = await newCtx(browser, { storageState: st });
  const page = await newPage(ctx);
  const saveGeneral = async () => anyToast(page, () => page.locator("form").getByRole("button", { name: /บันทึก/ }).last().click());
  // 1) only a contact phone (landline), no PromptPay ID
  await go(page, `/t/${SHOP}/settings`);
  await page.fill("#g-phone", "02-123-4567");
  out("save phone only", await saveGeneral());
  await page.waitForTimeout(1500);
  out("checkout with contact phone 02-123-4567 only", await checkout(browser, SHOP, "promptpay_qr"));
  const [p1] = await tt(tid, (tx) => tx.select({ method: payments.method, qr: payments.qrPayload, amount: payments.amount }).from(payments).where(eq(payments.tenantId, tid)).orderBy(desc(payments.createdAt)).limit(1));
  out("latest payment (landline)", p1);
  // mobile phone
  await go(page, `/t/${SHOP}/settings`);
  await page.fill("#g-phone", "089-999-0005");
  // LINE id variants
  await page.fill("#g-line", "@qab2line");
  out("save mobile + LINE", await saveGeneral());
  await page.waitForTimeout(1500);
  const h1 = await hreq(`${SHOP}.localhost:3000`, "/");
  out("storefront LINE links (@qab2line)", [...new Set(h1.body.match(/https:\/\/line\.me\/[^"]+/g) ?? [])]);
  out("checkout with contact mobile only", await checkout(browser, SHOP));
  await go(page, `/t/${SHOP}/settings`);
  await page.fill("#g-line", "qab2plain");
  await saveGeneral();
  await page.waitForTimeout(1500);
  const h2 = await hreq(`${SHOP}.localhost:3000`, "/");
  out("storefront LINE links (qab2plain)", [...new Set(h2.body.match(/https:\/\/line\.me\/[^"]+/g) ?? [])]);
  // 2) payments settings
  await go(page, `/t/${SHOP}/settings/payments`);
  const savePay = async () => anyToast(page, () => page.locator("form").getByRole("button", { name: /บันทึก/ }).last().click());
  await page.fill("#p-id", "12345");
  out("invalid promptpay 12345", await savePay());
  await page.fill("#p-id", "0899990006");
  await page.fill("#p-name", "QA B2 PromptPay");
  await page.getByRole("button", { name: /เพิ่มบัญชี/ }).click();
  await page.locator("#bank-0").click();
  await page.getByRole("option").first().click();
  await page.fill("#acct-name-0", "QA B2 Account");
  await page.fill("#acct-no-0", "111-2-33333-4");
  out("save valid payments", await savePay());
  await page.waitForTimeout(1500);
  const [t1] = await plat((tx) => tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, tid)));
  out("db payments", (t1!.s as any).payments);
  out("admin checklist (dashboard)", await (async () => { await go(page, `/t/${SHOP}/dashboard`); return ((await page.locator("main").innerText()).match(/\d+%/) ?? [""])[0]; })());
  out("checkout promptpay", await checkout(browser, SHOP, "promptpay_qr"));
  const [p2] = await tt(tid, (tx) => tx.select({ method: payments.method, qr: payments.qrPayload }).from(payments).where(eq(payments.tenantId, tid)).orderBy(desc(payments.createdAt)).limit(1));
  out("latest payment (promptpay)", p2);
  out("checkout slip", await checkout(browser, SHOP, "slip"));
  out("errors", page.__errors.slice(0, 6));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
