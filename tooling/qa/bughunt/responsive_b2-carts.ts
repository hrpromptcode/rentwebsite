import "../../load-env";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { diningTables, eq, getDb, tenants, withPlatform } from "@rentweb/db";
import { HERE, SHOTS, origin, newCtx, gotoRetry, runChecks, otpLogin, watchConsole } from "./responsive_b2-lib";

/**
 * responsive_b2: pages that only render fully with a cart: demo-shop /cart + /checkout with a real item (sofa-throw),
 * demo-restaurant /order + /menu with a line in the cart (cart bar), and the dine-in table page /t/<qr> — at 390/768/1024/1440,
 * motion on, checks at top, while scrolling and at max scroll (fixed bars vs LINE button vs footer).
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-carts.ts
 */
const log = (...a: unknown[]) => console.log(...a);
const W = [390, 768, 1024, 1440];

async function report(page: Page, label: string, w: number, logs: string[]) {
  await page.waitForTimeout(1500);
  const top = await runChecks(page, { tap: w === 390 });
  const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  const vh = page.viewportSize()!.height;
  const mid = new Set<string>();
  for (let y = Math.round(vh * 0.7); y < H - vh; y += Math.round(vh * 0.7)) {
    await page.evaluate(`window.scrollTo(0, ${y})`);
    await page.waitForTimeout(300);
    const r = await runChecks(page, { only: "covered" });
    for (const c of [...r.fixedOverlap]) mid.add("FIXOVL " + c);
  }
  await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await page.waitForTimeout(1200);
  const bot = await runChecks(page, {});
  const issues = [
    top.sw > top.vw || bot.sw > bot.vw ? `OVERFLOW ${Math.max(top.sw, bot.sw)}>${top.vw} ${JSON.stringify(top.overflow.slice(0, 2))}` : "",
    bot.covered.filter((c: string) => !/covered by header/.test(c)).length ? `COVERED@max ${JSON.stringify(bot.covered.filter((c: string) => !/covered by header/.test(c)).slice(0, 3))}` : "",
    top.fixedOverlap.length || bot.fixedOverlap.length || mid.size ? `FIXEDOVERLAP ${JSON.stringify([...top.fixedOverlap, ...bot.fixedOverlap, ...mid].slice(0, 3))}` : "",
    top.thaiClip.filter((t: string) => parseFloat(t.slice(5)) >= 2.5).length ? `THAI ${JSON.stringify(top.thaiClip.slice(0, 2))}` : "",
    w === 390 && top.tap.length ? `TAP ${JSON.stringify(top.tap.filter((t: string) => !/md:min-h-6/.test(t)).slice(0, 6))}` : "",
    top.noName.length ? `NONAME ${JSON.stringify(top.noName.slice(0, 3))}` : "",
    top.noLabel.length ? `NOLABEL ${JSON.stringify(top.noLabel.slice(0, 3))}` : "",
    logs.filter((l) => !/scroll-behavior|Reduced Motion/.test(l)).length ? `LOGS ${JSON.stringify(logs.filter((l) => !/scroll-behavior|Reduced Motion/.test(l)).slice(0, 2))}` : "",
  ].filter(Boolean);
  log(`${label} @${w} fixed=${JSON.stringify(bot.fixed)} ${issues.length ? "\n    " + issues.join("\n    ") : "OK"}`);
  logs.length = 0;
}

async function main() {
  const browser = await chromium.launch();
  // shop: signed-in customer with sofa-throw in the cart
  const sctx = await newCtx(browser, 1280, "reduce");
  const sp = await sctx.newPage();
  await otpLogin(sp, "demo-shop");
  await gotoRetry(sp, origin("demo-shop") + "/products/sofa-throw");
  await sp.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first().click();
  await sp.waitForTimeout(3000);
  const shopState = path.join(HERE, "responsive_b2-state-demo-shop-cart.json");
  await sctx.storageState({ path: shopState });
  await sctx.close();
  // restaurant table token
  const db = getDb();
  const tbl = await withPlatform(db, (tx) => tx.select({ qr: diningTables.qrToken, name: diningTables.name }).from(diningTables).innerJoin(tenants, eq(tenants.id, diningTables.tenantId)).where(eq(tenants.slug, "demo-restaurant")).limit(1));
  log(`table ${tbl[0]?.name} qr=${tbl[0]?.qr?.slice(0, 6)}…`);
  for (const w of W) {
    const ctx = await newCtx(browser, w, "no-preference", shopState);
    const page = await ctx.newPage();
    const logs = watchConsole(page);
    for (const r of ["/cart", "/checkout"]) {
      await gotoRetry(page, origin("demo-shop") + r);
      await report(page, `shop${r}${new URL(page.url()).pathname !== r ? " -> " + new URL(page.url()).pathname : ""}`, w, logs);
      if (w === 390 && r === "/checkout") await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-shop-checkout-390.png"), fullPage: true });
    }
    await ctx.close();
    // restaurant: add a line through the UI, then check /order + /menu with the cart bar
    const rctx = await newCtx(browser, w, "no-preference");
    const rp = await rctx.newPage();
    const rlogs = watchConsole(rp);
    await gotoRetry(rp, origin("demo-restaurant") + "/order");
    await rp.waitForTimeout(1500);
    await rp.locator("[data-item-id]:not([disabled])").first().click();
    await rp.waitForTimeout(1200);
    await rp.locator("[role=dialog] button").filter({ hasText: /เพิ่มในออเดอร์/ }).last().click();
    await rp.waitForTimeout(1500);
    await report(rp, "restaurant/order+cart", w, rlogs);
    if (w === 390) await rp.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-rest-order-cart-390.png") });
    await gotoRetry(rp, origin("demo-restaurant") + "/menu");
    await report(rp, "restaurant/menu+cart", w, rlogs);
    if (tbl[0]) {
      await gotoRetry(rp, origin("demo-restaurant") + "/t/" + tbl[0].qr);
      await report(rp, `restaurant/t/<qr> -> ${new URL(rp.url()).pathname.slice(0, 20)}`, w, rlogs);
      if (w === 390) await rp.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-rest-table-390.png") });
    }
    await rctx.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
