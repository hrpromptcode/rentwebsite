import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const url = process.argv[2] ?? "http://localhost:3000/";
const w = Number(process.argv[3] ?? 1440);
const reduce = process.argv.includes("--reduce");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" });
await isolateHmr(ctx);
const page = await ctx.newPage();
await stableGoto(page, url, "load");
await page.waitForTimeout(2000);
const res = await page.evaluate(() => {
  const vw = window.innerWidth;
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 0) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed") continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== "visible" || s.position === "fixed") { clipped = true; break; }
      }
      if (clipped) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  }
  return { sw: document.documentElement.scrollWidth, vw, out: out.slice(0, 15) };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
