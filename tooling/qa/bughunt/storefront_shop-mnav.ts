import "../../load-env";
import { chromium } from "@playwright/test";

/** Mobile nav behaviour: opens, link navigates and closes, scroll lock released, Escape closes (storefront_shop bughunt). */
async function main() {
  const browser = await chromium.launch();
  for (const slug of ["demo-shop", "demo-cafe", "demo-corporate"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`http://${slug}.localhost:3000/`, { waitUntil: "networkidle", timeout: 90_000 });
    const burger = page.locator('header button[aria-label="เปิดเมนู"]').first();
    await burger.click();
    await page.waitForTimeout(600);
    const dialog = page.locator('[role="dialog"]').first();
    const open = await dialog.isVisible().catch(() => false);
    const overflow1 = await page.evaluate("getComputedStyle(document.body).overflow + '/' + getComputedStyle(document.documentElement).overflow");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const closedByEsc = !(await dialog.isVisible().catch(() => false));
    await burger.click();
    await page.waitForTimeout(600);
    const link = dialog.locator("a[href]").filter({ hasNotText: /^$/ }).nth(1);
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL((u) => u.pathname === href, { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    const stillOpen = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    const overflow2 = await page.evaluate("getComputedStyle(document.body).overflow + '/' + getComputedStyle(document.documentElement).overflow");
    const canScroll = await page.evaluate("(window.scrollTo(0, 400), window.scrollY)");
    console.log(`[${slug}] open=${open} lock=${overflow1} escCloses=${closedByEsc} clicked ${href} -> ${new URL(page.url()).pathname} menuStillOpen=${stillOpen} lockAfter=${overflow2} scrollY=${canScroll}`);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
