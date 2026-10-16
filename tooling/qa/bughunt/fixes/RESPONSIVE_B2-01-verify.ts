import "../../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, gotoRetry, isolateHmr, runChecks } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-01 verify: TextReveal headings keep every Thai mark. For each hero/page header at 390 + 1440, motion on + reduce:
 *  - the hunter's thaiClip check (canvas ink box vs every clipping ancestor) reports no clip on [data-reveal-word] text
 *  - headClip reports no hidden words once revealed
 *  - a 3x screenshot of the h1 + 0.6em margin is written for visual review
 * Run from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RESPONSIVE_B2-01-verify.ts
 */
const PAGES: [string, string][] = [["demo-clinic", "/"], ["demo-restaurant", "/"], ["demo-corporate", "/"], ["demo-salon", "/"], ["demo-shop", "/"], ["demo-shop", "/collections/apparel"]];
async function main() {
  const browser = await chromium.launch();
  let fail = 0;
  for (const [slug, route] of PAGES) {
    for (const w of [390, 1440]) {
      for (const rm of ["no-preference", "reduce"] as const) {
        const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 3, reducedMotion: rm });
        await isolateHmr(ctx);
        const page = await ctx.newPage();
        await gotoRetry(page, origin(slug) + route);
        await page.waitForTimeout(rm === "reduce" ? 800 : 3500);
        const r = await runChecks(page, {});
        const clip = (r.thaiClip as string[]).filter((s) => s.includes("will-change-transform") || s.includes("data-reveal"));
        const head = (r.headClip as string[]) ?? [];
        const h1 = await page.evaluate(() => {
          const h = document.querySelector("h1");
          if (!h) return null;
          const b = h.getBoundingClientRect(), fs = parseFloat(getComputedStyle(h).fontSize), m = fs * 0.6;
          return { x: Math.max(0, b.left - m), y: Math.max(0, b.top + scrollY - m), width: Math.min(innerWidth, b.width + 2 * m), height: b.height + 2 * m, masks: h.querySelectorAll("[data-reveal-mask]").length };
        });
        const ok = !clip.length && !head.length && !!h1 && h1.masks > 0;
        if (!ok) fail++;
        console.log(`${ok ? "PASS" : "FAIL"} ${slug}${route} @${w} ${rm} masks=${h1?.masks ?? 0} thaiClip=${JSON.stringify(clip)} headClip=${JSON.stringify(head)}`);
        if (h1) await page.screenshot({ path: path.join(SHOTS, `fix-B2-01-${slug}${route.replace(/\//g, "_")}-${w}-${rm}.png`), clip: h1, fullPage: true });
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(fail ? `FAIL (${fail})` : "PASS (all)");
}
main().catch((e) => { console.error(e); process.exit(1); });
