/** events agent: debug the hero scene status (live / poster) over time. `pnpm exec tsx qa/redesign/_ev-dbg.ts [width] [url]` */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const W = Number(process.argv[2] ?? 1440);
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: W, height: W < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok" });
await isolateHmr(ctx);
const p = await ctx.newPage();
p.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && !/X4122|THREE\.Clock/.test(m.text())) console.log("console", m.type(), m.text().slice(0, 200));
});
await p.addInitScript(() => {
  const t0 = performance.now();
  (window as unknown as { __log: string[] }).__log = [];
  new MutationObserver((ms) => {
    for (const m of ms) if (m.attributeName === "data-scene-status") (window as unknown as { __log: string[] }).__log.push(`${Math.round(performance.now() - t0)}ms ${(m.target as Element).getAttribute("data-scene-status")}`);
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-scene-status"] });
});
const t = Date.now();
await stableGoto(p, process.argv[3] ?? "http://demo-events.localhost:3000/");
console.log("stableGoto took", Date.now() - t, "ms");
for (let i = 0; i < 4; i++) {
  await p.waitForTimeout(1500);
  if (i === 1) await p.screenshot({ path: "screenshots/.ev-dbg.png" });
  console.log(await p.evaluate(() => JSON.stringify({ status: Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status")), canvases: document.querySelectorAll("canvas").length, log: (window as unknown as { __log: string[] }).__log })));
}
await b.close();
