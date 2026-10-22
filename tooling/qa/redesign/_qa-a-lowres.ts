/** qa-a: which <img> renders wider than its natural width (reduce mode)? tsx qa/redesign/_qa-a-lowres.ts id url… */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [id, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
for (const url of urls) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: (process.env.RM ?? "reduce") as "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  await stableGoto(p, url, "load");
  for (let y = 0; y < 20000; y += 700) { await p.mouse.wheel(0, 700); await p.waitForTimeout(120); }
  await p.waitForTimeout(1500);
  const r = await p.evaluate((id) => [...document.images].filter((i) => i.currentSrc.includes(id)).map((i) => {
    const b = i.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), nat: i.naturalWidth, src: i.currentSrc.slice(0, 160), sizes: i.sizes, srcset: i.srcset.slice(0, 300), cls: i.className.slice(0, 120), parent: i.parentElement?.className.slice(0, 120) };
  }), id);
  console.log(url, JSON.stringify(r, null, 1));
  await ctx.close();
}
await b.close();
