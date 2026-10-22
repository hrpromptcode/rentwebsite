import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/** qa-b probe: frame aspect ratios of the cards on a page.  pnpm exec tsx qa/redesign/_qab-frames.ts <site> <path> <w> */
const [site, route, wArg] = process.argv.slice(2);
const w = Number(wArg ?? 390);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768 });
await isolateHmr(ctx);
await ctx.addInitScript("window.__name = (f) => f");
const page = await ctx.newPage();
try {
  await stableGoto(page, `http://demo-${site}.localhost:3000${route}`, "load");
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".bk-frame")].map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)} (${(r.height / Math.max(1, r.width)).toFixed(2)}) ${el.className.match(/aspect-\S+/g)?.join(" ") ?? ""}`;
    }),
  );
  console.log(out.join("\n"));
} finally {
  await browser.close();
}
