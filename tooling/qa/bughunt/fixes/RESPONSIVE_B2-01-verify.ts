import "../../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, gotoRetry, isolateHmr, runChecks } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-01 verify: TextReveal headings keep every Thai mark. For each hero/page header at 390 + 1440, motion on + reduce:
 *  - the hunter's thaiClip check (canvas ink box vs every clipping ancestor) reports no clip on [data-reveal-word] text
 *  - headClip reports no hidden words once revealed
 *  - Thai headings: no stacked mark collides with the line above (min ink gap between horizontally overlapping words on
 *    consecutive lines >= 0, canvas actualBoundingBox metrics against each word's baseline)
 *  - links just above / below the heading (breadcrumbs, CTAs) are still clickable through the padded masks
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
        const gap = await page.evaluate(() => {
          const h = document.querySelector("h1");
          if (!h) return null;
          const cv = document.createElement("canvas").getContext("2d")!;
          const ws = [...h.querySelectorAll<HTMLElement>("[data-reveal-word]")].map((wd) => {
            const cs = getComputedStyle(wd);
            cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const m = cv.measureText(wd.textContent || "");
            const probe = document.createElement("span");
            probe.style.cssText = "display:inline-block;width:0;height:0";
            wd.appendChild(probe);
            const base = probe.getBoundingClientRect().bottom;
            probe.remove();
            const b = wd.getBoundingClientRect();
            return { t: wd.textContent, l: b.left, r: b.right, base, top: base - m.actualBoundingBoxAscent, bot: base + m.actualBoundingBoxDescent, fs: parseFloat(cs.fontSize) };
          });
          let min = Infinity, pair = "";
          for (const a of ws) for (const b of ws) {
            if (b.base - a.base < 5 || b.base - a.base > a.fs * 2 || b.r < a.l || b.l > a.r) continue;
            if (b.top - a.bot < min) { min = b.top - a.bot; pair = `${a.t}/${b.t}`; }
          }
          return { min: Math.round(min * 10) / 10, pair };
        });
        const blocked = (await page.evaluate(`(() => {
          const h = document.querySelector("h1");
          if (!h) return [];
          const hr = h.getBoundingClientRect(), m = parseFloat(getComputedStyle(h).fontSize) * 0.6;
          return [...document.querySelectorAll("a, button")].filter((a) => {
            const r = a.getBoundingClientRect();
            // only controls a user can actually see (hover-only dropdown items are visibility:hidden until opened)
            return r.width > 0 && a.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && r.bottom > hr.top - m && r.top < hr.bottom + m && !h.contains(a);
          }).map((a) => {
            a.scrollIntoView({ block: "center", behavior: "instant" });
            const r = a.getBoundingClientRect();
            const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return t && (a === t || a.contains(t)) ? null : (a.textContent || "").trim().slice(0, 20) + " → " + (t ? t.tagName + (t.closest("[data-reveal-mask]") ? "[mask]" : "") : "none");
          }).filter(Boolean);
        })()`)) as string[];
        await page.evaluate("window.scrollTo(0, 0)");
        const ok = blocked.length === 0 && !clip.length && !head.length && !!h1 && h1.masks > 0 && !!gap && gap.min >= 0;
        if (!ok) fail++;
        console.log(`${ok ? "PASS" : "FAIL"} ${slug}${route} @${w} ${rm} masks=${h1?.masks ?? 0} lineGap=${gap?.min}(${gap?.pair}) blocked=${JSON.stringify(blocked)} thaiClip=${JSON.stringify(clip)} headClip=${JSON.stringify(head)}`);
        if (h1) await page.screenshot({ path: path.join(SHOTS, `fix-B2-01-${slug}${route.replace(/\//g, "_")}-${w}-${rm}.png`), clip: h1, fullPage: true });
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(fail ? `FAIL (${fail})` : "PASS (all)");
}
main().catch((e) => { console.error(e); process.exit(1); });
