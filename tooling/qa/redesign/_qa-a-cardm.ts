/** qa-a: card title box width vs. phrase max-content widths. tsx qa/redesign/_qa-a-cardm.ts <w> <url> */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [w, url] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(w), height: 900 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
await ctx.addInitScript({ content: "window.__name = (f) => f;" });
const p = await ctx.newPage();
await stableGoto(p, url!, "load");
await p.waitForTimeout(1500);
console.log((await p.evaluate(() => [...document.querySelectorAll<HTMLElement>("h3.rwc-title")].map((h) => {
  const m = (t: string) => { const s = document.createElement("span"); s.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap"; s.textContent = t; h.appendChild(s); const r = s.getBoundingClientRect().width; s.remove(); return Math.round(r); };
  const txt = h.textContent!.trim();
  return `${h.clientWidth}px | ${txt.split(/\s+/).map((ph) => `${ph}=${m(ph)}`).join(" ")} | all=${m(txt)} | ${getComputedStyle(h).textWrap}`;
}))).join("\n"));
await b.close();
