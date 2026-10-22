/** qa-a: under reduced motion, does pointer movement change DOM transforms or the canvas? tsx qa/redesign/_qa-a-rmptr.ts url */
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
await ctx.addInitScript({ content: "window.__name = (f) => f;" });
const p = await ctx.newPage();
await stableGoto(p, process.argv[2]!, "load");
await p.waitForTimeout(4000);
const snap = () => p.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>("section:first-of-type *").forEach((el) => { const t = getComputedStyle(el).transform; if (t !== "none") out.push(t); });
  const c = document.querySelector("canvas") as HTMLCanvasElement | null;
  return { transforms: out.join(";"), canvas: c ? c.toDataURL().length : 0 };
});
const canvasHash = async () => { const c = await p.$("canvas"); return c ? crypto.createHash("md5").update(await c.screenshot()).digest("hex").slice(0, 8) : "-"; };
const a = await snap(); const ha = await canvasHash();
await p.mouse.move(300, 300); await p.waitForTimeout(400); await p.mouse.move(1100, 600); await p.waitForTimeout(900);
const b2 = await snap(); const hb = await canvasHash();
console.log("dom transforms changed:", a.transforms !== b2.transforms, "| canvas element shot changed:", ha !== hb, ha, hb);
await b.close();
