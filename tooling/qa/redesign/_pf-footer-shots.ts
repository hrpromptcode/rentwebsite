import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Footer + templates-title frames for the owner's 2026-10-23 redesign request.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/_pf-footer-shots.ts [--w=1440,390] [--url=/,/pricing] [--tag=x] [--reduce]
 * → screenshots/pf-footer-<tag>-<page>-<w>.png (bottom of the page, pointer over the wordmark on desktop) and logs the
 * wordmark fit (text width vs. box), overflow and console errors.
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const widths = (arg("w") ?? "1440,390").split(",").map(Number);
const urls = (arg("url") ?? "/,/pricing").split(",");
const tag = arg("tag") ?? "v";
const reduce = process.argv.includes("--reduce");
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
try {
  for (const w of widths) {
    const mobile = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: reduce ? "reduce" : "no-preference" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match|mismatch/i.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
    for (const u of urls) {
      await stableGoto(page, `http://localhost:3000${u}`, "load");
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(800);
      const info = await page.evaluate(`(() => {
        const box = document.querySelector(".pf-fwm");
        const word = document.querySelector(".pf-fwm__glass"); const half = document.querySelector(".pf-fwm__glass [data-half]");
        const footer = document.querySelector("footer.pf-footer");
        if (!box || !word || !footer) return { missing: true };
        const range = document.createRange();
        range.selectNodeContents(word);
        const tr = range.getBoundingClientRect();
        const bs = getComputedStyle(box);
        const inner = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
        const fs = parseFloat(getComputedStyle(word).fontSize);
        const fr = footer.getBoundingClientRect();
        return { inner: Math.round(inner), textW: Math.round(tr.width), fs: Math.round(fs * 10) / 10, emK: Math.round((tr.width / fs) * 1000) / 1000, footerH: Math.round(fr.height), textBottomPastFooter: Math.round(tr.bottom - fr.bottom), textTopInFooter: Math.round(tr.top - fr.top), halfK: half ? (() => { const r2 = document.createRange(); r2.selectNodeContents(half); return Math.round((r2.getBoundingClientRect().width / fs) * 1000) / 1000; })() : null };
      })()`);
      console.log(`@${w} ${u}`, JSON.stringify(info));
      const name = u === "/" ? "home" : u.replace(/\//g, "-").replace(/^-/, "");
      if (!mobile) {
        const fwm = await page.locator(".pf-fwm__word").boundingBox();
        if (fwm) {
          await page.mouse.move(fwm.x + fwm.width * 0.2, fwm.y + fwm.height * 0.3);
          await page.mouse.move(fwm.x + fwm.width * 0.56, fwm.y + fwm.height * 0.45, { steps: 20 });
          await page.waitForTimeout(900);
        }
      }
      await page.screenshot({ path: path.join(SHOTS, `pf-footer-${tag}-${name}-${w}.png`) });
      // the footer top half as well (link grid)
      const top = await page.evaluate(() => {
        const f = document.querySelector("footer.pf-footer");
        return f ? f.getBoundingClientRect().top + window.scrollY : 0;
      });
      await page.evaluate((y) => window.scrollTo(0, y - 40), top);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOTS, `pf-footer-${tag}-${name}-top-${w}.png`) });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`@${w} overflow=${overflow} errors=${errors.length}`);
    for (const e of errors.slice(0, 6)) console.log("  ", e);
    await ctx.close();
  }
} finally {
  await browser.close();
}
