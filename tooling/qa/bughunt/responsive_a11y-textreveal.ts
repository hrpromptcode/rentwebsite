import "../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr } from "./fixes/_dev-stable";
// reverify-repro 2026-10-17: the RA-03 fix replaced the motion-safe:translate-y-[110%] word classes with [data-reveal-word]
// (start state in CSS); the old selector finds nothing ("no TextReveal"). Probe every word of the first heading instead and
// isolate dev HMR reloads (networkidle never settled on demo-cafe). Verdict: every word visible inside its mask.
/** responsive_a11y: are TextReveal words visible after animating (motion enabled)? */
async function main() {
  const browser = await chromium.launch();
  for (const [slug, route] of [["demo-shop", "/"], ["demo-shop", "/products"], ["demo-cafe", "/"], ["demo-restaurant", "/"], ["demo-salon", "/"], ["demo-clinic", "/"], ["demo-corporate", "/"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await page.goto(`http://${slug}.localhost:3000${route}`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(2500);
    const r = (await page.evaluate(`(() => { const words = [...document.querySelectorAll('[data-reveal-word]')]; if (!words.length) return { count: 0 }; const vis = words.filter(w => { const m = w.parentElement.getBoundingClientRect(), r = w.getBoundingClientRect(); const cs = getComputedStyle(w); return cs.opacity !== '0' && Math.min(m.bottom, r.bottom) - Math.max(m.top, r.top) >= r.height * 0.9; }); return { count: words.length, visible: vis.length, first: words[0].textContent }; })()`)) as { count: number; visible?: number; first?: string };
    console.log(slug, route, JSON.stringify(r));
    console.log(r.count === 0 ? `SKIP ${slug}${route} has no TextReveal heading` : r.visible === r.count ? `PASS RA-03 ${slug}${route} ${r.visible}/${r.count} words visible` : `FAIL RA-03 ${slug}${route} ${r.visible}/${r.count} words visible`);
    if (slug === "demo-shop" && route === "/") await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-textreveal-shop.png", clip: { x: 0, y: 0, width: 1440, height: 700 } });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
