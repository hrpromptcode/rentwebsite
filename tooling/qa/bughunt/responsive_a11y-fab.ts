import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: LINE FAB vs footer legal links at max scroll; which element receives a click at the link's centre. */
async function main() {
  const browser = await chromium.launch();
  for (const [slug, w] of [["demo-cafe", 1440], ["demo-salon", 1024], ["demo-shop", 390]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, reducedMotion: "reduce", isMobile: w < 768 });
    const page = await ctx.newPage();
    await page.goto(`http://${slug}.localhost:3000/${w === 390 ? "products/sofa-throw" : ""}`, { waitUntil: "networkidle" });
    await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await page.waitForTimeout(600);
    const r = await page.evaluate(`[...document.querySelectorAll('footer a')].filter(a => /terms|privacy/.test(a.getAttribute('href')||'')).map(a => { const r = a.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return { link: a.textContent.trim(), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hit: top === a || a.contains(top) ? 'link' : (top.closest('a,button,div') || top).className.toString().slice(0, 60) + ' ' + (top.textContent||'').trim().slice(0,20) }; })`);
    console.log(slug, w, JSON.stringify(r));
    await page.screenshot({ path: `screenshots/bughunt-responsive_a11y-fab-${slug}-${w}.png`, clip: { x: 0, y: (w < 768 ? 844 : 900) - 160, width: w, height: 160 } });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
