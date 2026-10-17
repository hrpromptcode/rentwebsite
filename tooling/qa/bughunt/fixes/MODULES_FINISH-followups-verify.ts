/**
 * modules_finish storefront follow-ups (web_final packet).
 *  1. demo-restaurant /reserve at 390: the floating LINE button never covers the zone cards (the form hides it through
 *     the shell's FloatingChatOptOut while it is on a phone screen); it is back once the form is scrolled away, and it
 *     stays visible at 1440.
 *  2. SS-12 polish: header cart badge = the account cart right after logging in on a second device (device A: signed in,
 *     1 item in the account cart; device B: guest adds 1 item, then logs in → badge 2 on the first page after login,
 *     before /cart is opened).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/MODULES_FINISH-followups-verify.ts
 */
import type { BrowserContext, Page } from "@playwright/test";
import { and, cartItems, carts, customerOtps, customers, desc, eq, inArray } from "@rentweb/db";
import { sha256 } from "@rentweb/core/crypto";
import { done, launch, newCtx, rand, readCreds, shot, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra).slice(0, 400) : ""}`);
};
const browser = await launch();
const mk = async (vp: { width: number; height: number }): Promise<BrowserContext> => {
  const ctx = await newCtx(browser, { viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  await isolateHmr(ctx);
  return ctx;
};
const overlap = (a: { x: number; y: number; width: number; height: number } | null, b: { x: number; y: number; width: number; height: number } | null) =>
  !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ---- 1. /reserve floating LINE vs zone cards
try {
  const REST = "http://demo-restaurant.localhost:3000";
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const ctx = await mk(vp);
    const page = await ctx.newPage();
    await page.goto(`${REST}/reserve`, { waitUntil: "load", timeout: 120_000 });
    const zones = page.locator('[role="radiogroup"][aria-label="โซน"] > *');
    await zones.first().waitFor({ timeout: 60_000 });
    const chat = page.locator("[data-floating-chat]");
    const hits: unknown[] = [];
    let hiddenSeen = false;
    // walk the page so the zone cards pass through every part of the viewport, incl. the bottom-right corner
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= total; y += 120) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" as ScrollBehavior }), y);
      await page.waitForTimeout(120);
      const chatBox = (await chat.isVisible().catch(() => false)) ? await chat.boundingBox() : null;
      if (!chatBox) hiddenSeen = true;
      for (let i = 0; i < (await zones.count()); i++) {
        const zb = await zones.nth(i).boundingBox();
        if (overlap(chatBox, zb)) hits.push({ y, zone: i, chatBox, zb });
      }
    }
    if (vp.width < 768) {
      check("[390] /reserve: the LINE button never overlaps a zone card while scrolling", hits.length === 0, hits.slice(0, 3));
      check("[390] /reserve: the LINE button is hidden while the form is on screen", hiddenSeen);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior }));
      await page.waitForTimeout(500);
      check("[390] /reserve: the LINE button is back below the form (footer)", await chat.isVisible(), null);
      await zones.first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy({ top: -(window.innerHeight - 260), behavior: "instant" as ScrollBehavior }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot("web_final-reserve-zones-390") });
    } else {
      check("[1440] /reserve: LINE button stays visible on desktop and clear of the zone cards", !hiddenSeen && hits.length === 0, { hiddenSeen, hits: hits.slice(0, 2) });
    }
    await ctx.close();
  }

  // ---- 2. cart badge after login on a second device
  const c = readCreds();
  const shop = c.tenants.find((t: { key: string }) => t.key === "shop") as { slug: string; id: string };
  const SHOP = `http://${shop.slug}.localhost:3000`;
  const email = `qa-wf-cart-${rand()}@example.com`;
  const badge = async (page: Page) => {
    const link = page.locator('header a[href="/cart"]').first();
    const t = (await link.innerText().catch(() => "")).trim();
    return t ? Number(t) : 0;
  };
  const addOne = async (page: Page) => {
    await page.goto(`${SHOP}/products`, { waitUntil: "load", timeout: 120_000 });
    const href = await page.locator('main a[href^="/products/"]').first().getAttribute("href");
    await page.goto(`${SHOP}${href}`, { waitUntil: "load" });
    const add = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    for (let i = 0; i < (await add.count()); i++) if (await add.nth(i).isVisible()) { await add.nth(i).click(); break; }
    await page.waitForTimeout(2500);
  };
  const login = async (page: Page, next: string) => {
    // second device logs in with the same e-mail: move this test address's earlier code out of the 60 s request cooldown
    await tt(shop.id, (tx) => tx.update(customerOtps).set({ createdAt: new Date(Date.now() - 5 * 60_000) }).where(and(eq(customerOtps.tenantId, shop.id), eq(customerOtps.target, email))));
    await page.goto(`${SHOP}/account/login?next=${encodeURIComponent(next)}`, { waitUntil: "load" });
    await page.locator("#otp-target").fill(email);
    await page.locator("#otp-target").press("Enter");
    await page.locator("#otp-code").waitFor({ timeout: 60_000 });
    const [otp] = await tt(shop.id, (tx) => tx.select({ id: customerOtps.id }).from(customerOtps).where(and(eq(customerOtps.tenantId, shop.id), eq(customerOtps.target, email))).orderBy(desc(customerOtps.createdAt)).limit(1));
    await tt(shop.id, (tx) => tx.update(customerOtps).set({ codeHash: sha256("135790") }).where(eq(customerOtps.id, otp!.id)));
    await page.locator("#otp-code").fill("135790");
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 60_000 }), page.locator("#otp-code").press("Enter")]);
    await page.waitForLoadState("load");
  };
  try {
    const a = await mk({ width: 1440, height: 900 });
    const pa = await a.newPage();
    await login(pa, "/");
    await addOne(pa);
    await pa.goto(`${SHOP}/`, { waitUntil: "load" });
    const aCount = await badge(pa);
    check("device A (signed in) has 1 item", aCount === 1, aCount);

    const b = await mk({ width: 390, height: 844 });
    const pb = await b.newPage();
    await addOne(pb);
    await pb.goto(`${SHOP}/`, { waitUntil: "load" });
    const guest = await badge(pb);
    check("device B guest cart shows 1", guest === 1, guest);
    await login(pb, "/");
    const after = await badge(pb);
    check("device B right after login: badge shows the merged account cart (2), not the guest count", after === 2, { after, url: pb.url() });
    await pb.screenshot({ path: shot("web_final-cart-badge-after-login-390") });
    await pb.goto(`${SHOP}/cart`, { waitUntil: "load" });
    const qty = await pb.locator('input[name="quantity"], input[aria-label="จำนวน"]').evaluateAll((els) => els.reduce((s, e) => s + Number((e as HTMLInputElement).value || 0), 0));
    check("/cart agrees with the badge", qty === after, { qty, after });
    await a.close();
    await b.close();
  } finally {
    const [cu] = await tt(shop.id, (tx) => tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, shop.id), eq(customers.email, email))));
    if (cu) {
      const ids = (await tt(shop.id, (tx) => tx.select({ id: carts.id }).from(carts).where(and(eq(carts.tenantId, shop.id), eq(carts.customerId, cu.id))))).map((r) => r.id);
      if (ids.length) {
        await tt(shop.id, (tx) => tx.delete(cartItems).where(and(eq(cartItems.tenantId, shop.id), inArray(cartItems.cartId, ids))));
        await tt(shop.id, (tx) => tx.delete(carts).where(and(eq(carts.tenantId, shop.id), inArray(carts.id, ids)))).catch((e) => console.log("cleanup carts", String(e).slice(0, 120)));
      }
      await tt(shop.id, (tx) => tx.delete(customers).where(and(eq(customers.tenantId, shop.id), eq(customers.id, cu.id)))).catch((e) => console.log("cleanup customer", String(e).slice(0, 120)));
    }
  }
} finally {
  await browser.close();
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
