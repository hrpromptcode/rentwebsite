import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/** reverify-storefront: first-viewport shot (motion ON) of one page.  tsx _rv-top.ts demo-x /path width [scrollY] */
async function main() {
  const [slug, p = "/", ws = "390", sy = "0"] = process.argv.slice(2);
  const width = Number(ws);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "no-preference", isMobile: width < 768, hasTouch: width < 768, locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await stableGoto(page, `http://${slug}.localhost:3000${p}`);
  await page.waitForTimeout(2500);
  if (Number(sy)) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), Number(sy)); await page.waitForTimeout(1500); }
  const out = `screenshots/rvtop-${slug}-${p.replace(/\W+/g, "_")}-${width}-${sy}.png`;
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => { const h = document.querySelector("header"); const logo = h?.querySelector("a"); return { headerColor: h ? getComputedStyle(h).color : null, headerBg: h ? getComputedStyle(h).backgroundColor : null, logoColor: logo ? getComputedStyle(logo).color : null, cls: h?.className.slice(0, 200) }; });
  console.log(out, JSON.stringify(info));
  await b.close();
}
main();
