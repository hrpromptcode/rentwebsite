/**
 * qa-a: scroll jank by segment, with and without the 3D scene. tsx qa/redesign/_qa-a-perf.ts <url> [w=390] [runs=2]
 * Per run: wheel-scroll the page in 120 px steps; rAF intervals are bucketed by scrollY segment (hero / mid / rest).
 * Modes: "3d" (theme default) and "off" (html[data-scene3d="off"] → posters only).
 */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [url, wArg, runsArg] = process.argv.slice(2);
const w = Number(wArg ?? 390), runs = Number(runsArg ?? 2);
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const mode of ["3d", "off"] as const) {
  for (let r = 0; r < runs; r++) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768, deviceScaleFactor: w < 768 ? 2 : 1 });
    await isolateHmr(ctx);
    await ctx.addInitScript({ content: "window.__name = (f) => f;" });
    if (mode === "off") await ctx.addInitScript({ content: `new MutationObserver(() => { const h = document.documentElement; if (h && h.getAttribute("data-scene3d") !== "off") h.setAttribute("data-scene3d", "off"); }).observe(document, { subtree: true, childList: true, attributes: true });` });
    const p = await ctx.newPage();
    await stableGoto(p, url!, "load");
    await p.waitForTimeout(3500);
    await p.evaluate(() => {
      const W = window as unknown as { __f: { y: number; d: number }[] };
      W.__f = [];
      let last = performance.now();
      const tick = (t: number) => { W.__f.push({ y: scrollY, d: t - last }); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    for (let i = 0; i < 70; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(90); }
    const res = await p.evaluate(() => {
      const f = (window as unknown as { __f: { y: number; d: number }[] }).__f.slice(2);
      const seg = (lo: number, hi: number) => { const s = f.filter((x) => x.y >= lo && x.y < hi); if (!s.length) return "-"; const tot = s.reduce((a, x) => a + x.d, 0); return `${Math.round((s.length / tot) * 1000)}fps/${s.filter((x) => x.d > 50).length}long/${Math.round(Math.max(...s.map((x) => x.d)))}ms`; };
      return { hero: seg(0, 900), mid: seg(900, 3500), rest: seg(3500, 1e9), canv: document.querySelectorAll("canvas").length, s3d: document.documentElement.getAttribute("data-scene3d") };
    });
    console.log(mode, r, JSON.stringify(res));
    await ctx.close();
  }
}
await b.close();
