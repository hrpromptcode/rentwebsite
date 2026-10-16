import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: TextReveal heading after 6s + scroll jiggle, phone width; compare reduce vs no-preference. */
async function main() {
  const browser = await chromium.launch();
  for (const rm of ["no-preference", "reduce"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: rm, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://demo-cafe.localhost:3000/`, { waitUntil: "networkidle" });
    await page.mouse.wheel(0, 200); await page.waitForTimeout(800); await page.mouse.wheel(0, -200);
    await page.waitForTimeout(6000);
    const r = await page.evaluate(`(() => { const h = document.querySelector('main h1'); const spans = [...h.querySelectorAll('span > span')]; return { h1Label: h.getAttribute('aria-label'), h1Text: h.innerText, words: spans.length, visibleWords: spans.filter(s => { const pr = s.parentElement.getBoundingClientRect(), r = s.getBoundingClientRect(); return getComputedStyle(s).opacity !== '0' && Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top) > 2; }).length }; })()`);
    console.log(rm, JSON.stringify(r));
    await page.screenshot({ path: `screenshots/bughunt-responsive_a11y-textreveal-cafe-390-${rm}.png` });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
