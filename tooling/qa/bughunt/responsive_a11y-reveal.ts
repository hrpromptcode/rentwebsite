import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: after a Reveal animates in (motion enabled), is the Tailwind v4 `translate` start offset still applied? */
async function main() {
  const browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "no-preference", isMobile: width < 768, hasTouch: width < 768 });
    const page = await ctx.newPage();
    await page.goto("http://demo-corporate.localhost:3000/", { waitUntil: "networkidle" });
    await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } await new Promise(r => setTimeout(r, 1500)); })()`);
    const res = await page.evaluate(`[...document.querySelectorAll('[class*="motion-safe:translate-x-7"], [class*="motion-safe:-translate-x-7"], [class*="motion-safe:translate-y-7"]')].slice(0, 6).map(el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { cls: el.className.split(' ').slice(0,3).join('.'), inlineStyle: el.getAttribute('style'), translate: cs.translate, transform: cs.transform, opacity: cs.opacity, left: Math.round(r.left), right: Math.round(r.right) }; })`);
    console.log(width, "scrollWidth=", await page.evaluate("document.documentElement.scrollWidth"), JSON.stringify(res, null, 1));
    if (width === 390) {
      const el = page.locator('[class*="motion-safe:translate-x-7"]').first();
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-reveal-offset-390.png" });
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
