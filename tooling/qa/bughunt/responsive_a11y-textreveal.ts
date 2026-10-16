import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: are TextReveal words visible after animating (motion enabled)? */
async function main() {
  const browser = await chromium.launch();
  for (const [slug, route] of [["demo-shop", "/"], ["demo-shop", "/products"], ["demo-cafe", "/"], ["demo-restaurant", "/"], ["demo-salon", "/"], ["demo-clinic", "/"], ["demo-corporate", "/"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`http://${slug}.localhost:3000${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(`(() => { const spans = [...document.querySelectorAll('[class*="motion-safe:translate-y-[110%]"]')]; if (!spans.length) return 'no TextReveal'; const s = spans[0]; const cs = getComputedStyle(s); const pr = s.parentElement.getBoundingClientRect(), r = s.getBoundingClientRect(); return { count: spans.length, text: s.textContent, inline: s.getAttribute('style'), translate: cs.translate, transform: cs.transform, opacity: cs.opacity, wrapTop: Math.round(pr.top), wrapBottom: Math.round(pr.bottom), wordTop: Math.round(r.top), wordBottom: Math.round(r.bottom), visiblePx: Math.max(0, Math.round(Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top))) }; })()`);
    console.log(slug, route, JSON.stringify(r));
    if (slug === "demo-shop" && route === "/") await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-textreveal-shop.png", clip: { x: 0, y: 0, width: 1440, height: 700 } });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
