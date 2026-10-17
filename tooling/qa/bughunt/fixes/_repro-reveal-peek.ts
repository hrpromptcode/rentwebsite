import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
async function main() {
  const browser = await chromium.launch();
  for (const rm of ["no-preference", "reduce"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 844 }, reducedMotion: rm });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await page.goto("http://demo-corporate.localhost:3000/", { waitUntil: "networkidle" });
    await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } await new Promise(r => setTimeout(r, 1500)); })()`);
    const r = await page.evaluate(`[...document.querySelectorAll('[data-reveal], [data-reveal-item]')].map(el => ({ t: getComputedStyle(el).translate, tf: getComputedStyle(el).transform, cls: el.className.slice(0, 160), style: el.getAttribute('style'), parent: el.parentElement.className.slice(0,120), html: el.outerHTML.slice(0, 200) })).filter(x => x.t !== 'none' && x.t !== '0px' && x.t !== '0px 0px')`);
    console.log(rm, JSON.stringify(r, null, 1));
    await ctx.close();
  }
  await browser.close();
}
main();
