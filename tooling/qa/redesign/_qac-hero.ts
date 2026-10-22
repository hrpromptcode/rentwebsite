/** qa-c: first-viewport shots of a page at timed intervals (lazy scene check). args: url w waits(csv ms) name [reduce] */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [url, w, waits, name, mode] = process.argv.slice(2) as [string, string, string, string, string?];
const W = Number(w);
const b = await chromium.launch({ args: mode === "nogl" ? [] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: W, height: W < 768 ? 844 : 900 }, isMobile: W < 768, hasTouch: W < 768, reducedMotion: mode === "reduce" ? "reduce" : "no-preference", locale: "th-TH", timezoneId: "Asia/Bangkok" });
await isolateHmr(ctx);
await ctx.addInitScript({ content: "window.__name = (f) => f;" });
const p = await ctx.newPage();
const errs: string[] = [];
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
p.on("pageerror", (e) => errs.push(`pageerror ${e.message.slice(0, 200)}`));
await stableGoto(p, url, "load");
let t = 0;
for (const ms of waits.split(",").map(Number)) {
  await p.waitForTimeout(ms - t);
  t = ms;
  await p.screenshot({ path: `screenshots/redesign-qa-c-${name}-${W}-t${ms}.png` });
  const s = await p.evaluate(() => Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => `${e.getAttribute("data-scene-status")}:${(e as HTMLElement).offsetWidth}x${(e as HTMLElement).offsetHeight}`).join(","));
  console.log(ms, s);
}
console.log(errs.slice(0, 10).join("\n"));
await b.close();
