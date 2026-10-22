/** qa-a: under prefers-reduced-motion, is any canvas still animating? tsx qa/redesign/_qa-a-rmstill.ts url… */
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const url of process.argv.slice(2)) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  await stableGoto(p, url, "load");
  await p.waitForTimeout(4000);
  const boxes = await p.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter((r) => r.w > 2 && r.y < innerHeight && r.y + r.h > 0));
  const shots: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (process.env.MOVE) await p.mouse.move(400 + i * 300, 400 + i * 50);
    await p.waitForTimeout(700);
    const hs = await Promise.all(boxes.map(async (r) => crypto.createHash("md5").update(await p.screenshot({ clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.w, 1440), height: Math.min(r.h, 900 - Math.max(0, r.y)) } })).digest("hex").slice(0, 8)));
    shots.push(hs.join(","));
  }
  console.log(url.replace("http://", ""), "canvases-in-view", boxes.length, "hashes", shots.join(" | "), new Set(shots).size > 1 ? "ANIMATING" : "still");
  await ctx.close();
}
await b.close();
