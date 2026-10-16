import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * web_visual after-shots: first viewport of a few homes with motion ON (no-preference — the audience RA-02/RA-03 hit)
 * after the hero reveal has played, at 1440 and 390, plus the max-scroll footer at 1440 (RA-04).
 * Written to tooling/screenshots/web_visual-after-<tenant>-<width>.png / -footer.png. Compare with the bughunt-responsive_a11y-* "before" shots.
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/web_visual-shots.ts [demo-x ...]
 */
const tenants = process.argv.slice(2).filter((a) => a.startsWith("demo-"));
async function main() {
  const browser = await chromium.launch();
  for (const slug of tenants.length ? tenants : ["demo-cafe", "demo-shop", "demo-salon"]) {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "no-preference", isMobile: width < 768, hasTouch: width < 768 });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      await stableGoto(page, `http://${slug}.localhost:3000/`);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `screenshots/web_visual-after-${slug}-${width}.png` });
      if (width === 1440) {
        await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 400) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 100)); } window.scrollTo({ top: h, behavior: "instant" }); })()`);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `screenshots/web_visual-after-${slug}-${width}-footer.png` });
      }
      await ctx.close();
      console.log("shot", slug, width);
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
