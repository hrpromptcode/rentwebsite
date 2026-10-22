import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Templates title: entrance mid-frame, settled frame, hover frame (weight wave + wider capsule) at 1440, and the
 * reduced-motion frames of the title + footer (1440 + 390).
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/_pf-tpl-interact.ts
 */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const errors: string[] = [];
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|mismatch/i.test(m.text())) errors.push(`[motion] ${m.text().slice(0, 240)}`);
    });
    page.on("pageerror", (e) => errors.push(`[motion pageerror] ${e.message.slice(0, 240)}`));
    await stableGoto(page, "http://localhost:3000/", "load");
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(800);
    const y = await page.evaluate(() => {
      const el = document.querySelector("#templates");
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, "pf-tpl-entrance-1440.png") });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(SHOTS, "pf-tpl-settled-1440.png") });
    const box = await page.locator("#templates-title .pf-tpl__word").boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, "pf-tpl-hover-1440.png") });
      const st = await page.evaluate(() => {
        const u = document.querySelector("#templates-title [data-split-unit]");
        const c = document.querySelector("#templates-title .pf-tpl__capsule");
        return { weight: u ? getComputedStyle(u).fontWeight : null, capsuleW: c ? Math.round(c.getBoundingClientRect().width) : null };
      });
      console.log("hover", JSON.stringify(st));
      await page.mouse.move(10, 10);
    }
    await ctx.close();
  }
  for (const w of [1440, 390]) {
    const mobile = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|mismatch/i.test(m.text())) errors.push(`[reduce ${w}] ${m.text().slice(0, 240)}`);
    });
    page.on("pageerror", (e) => errors.push(`[reduce ${w} pageerror] ${e.message.slice(0, 240)}`));
    await stableGoto(page, "http://localhost:3000/", "load");
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const el = document.querySelector("#templates");
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `pf-tpl-reduce-${w}.png`) });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `pf-footer-reduce-${w}.png`) });
    const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName ?? "?").slice(0, 12));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`reduce @${w} overflow=${overflow} running=${JSON.stringify(anim)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`errors=${errors.length}`);
for (const e of errors) console.log("  ", e);
