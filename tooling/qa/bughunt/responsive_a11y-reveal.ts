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
    // reverify-repro 2026-10-17: the RA-02 fix replaced the Tailwind motion-safe:translate-* start classes with
    // data-reveal / data-reveal-item (start state in CSS), so the old class selector matches nothing. Probe the new hooks.
    const res = (await page.evaluate(`[...document.querySelectorAll('[data-reveal], [data-reveal-item]')].map(el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { reveal: el.getAttribute('data-reveal') ?? 'item', staticTransform: /(^| )([a-z]+:)*-?(translate-|scale-|rotate-)/.test(el.className), translate: cs.translate, transform: cs.transform, opacity: cs.opacity, left: Math.round(r.left), right: Math.round(r.right) }; })`)) as Array<{ staticTransform: boolean; translate: string; transform: string; opacity: string }>;
    const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
    const shifted = res.filter((r) => r.opacity !== "1" || (!r.staticTransform && ((r.translate !== "none" && !/^0px( 0px)?$/.test(r.translate)) || (r.transform !== "none" && r.transform !== "matrix(1, 0, 0, 1, 0, 0)")))); // intentional md:translate / lg:scale classes are static layout, not a start offset
    console.log(width, "scrollWidth=", sw, "revealed blocks", res.length, "still offset/hidden", JSON.stringify(shifted.slice(0, 6)));
    console.log(res.length > 0 && !shifted.length && sw <= width ? `PASS RA-02 ${width}: ${res.length} revealed blocks at identity transform, opacity 1, no sideways scroll` : `FAIL RA-02 ${width}: ${shifted.length}/${res.length} blocks offset, scrollWidth ${sw}`);
    if (width === 390) {
      const el = page.locator('[data-reveal]').first();
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-reveal-offset-390.png" });
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
