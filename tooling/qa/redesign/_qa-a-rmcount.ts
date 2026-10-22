/** qa-a: canvas count over time under reduced motion (with a pointer move at 5 s). tsx qa/redesign/_qa-a-rmcount.ts url */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
const p = await ctx.newPage();
await stableGoto(p, process.argv[2]!, "load");
const log: string[] = [];
const t0 = Date.now();
for (let i = 0; i < 12; i++) {
  if (i === 5) { await p.mouse.move(300, 300); await p.mouse.move(1100, 600, { steps: 8 }); }
  const n = await p.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}`).join("+") || "0");
  const poster = await p.evaluate(() => document.querySelectorAll("[data-scene-poster], [data-poster], img[data-scene]").length);
  log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s:${n}/p${poster}`);
  await p.waitForTimeout(700);
}
console.log(log.join("  "));
await b.close();
