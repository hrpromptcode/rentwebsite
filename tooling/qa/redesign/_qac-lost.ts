/** qa-c probe: does a hero scene stay "live" after the visitor scrolls the whole page and comes back? (no screenshots)
 *   cd tooling && pnpm exec tsx qa/redesign/_qac-lost.ts demo-events [/path] [--w=1440] */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const host = process.argv[2] ?? "demo-events";
const p0 = process.argv.find((a) => a.startsWith("/")) ?? "/";
const w = Number(process.argv.find((a) => a.startsWith("--w="))?.slice(4) ?? 1440);
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768 });
await isolateHmr(ctx);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (/lost|webgl|context/i.test(m.text())) console.log("console:", m.type(), m.text().slice(0, 160));
});
await stableGoto(page, `http://${host}.localhost:3000${p0}`, "load");
await page.evaluate(() => {
  const w = window as unknown as { __lost: string[] };
  w.__lost = [];
  document.addEventListener("webglcontextlost", (e) => w.__lost.push(`lost ${(e.target as HTMLElement).tagName} ${Math.round(performance.now())}`), true);
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target as HTMLElement;
      if (m.attributeName === "data-scene-status") w.__lost.push(`status ${el.getAttribute("data-scene-status")} y=${Math.round(scrollY)} t=${Math.round(performance.now())}`);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-scene-status"] });
});
const st = () => page.evaluate(() => Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status")).join(","));
await page.waitForTimeout(5000);
console.log("after load:", await st());
const H = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H; y += 300) {
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
console.log("at bottom:", await st());
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
await page.waitForTimeout(4000);
console.log("back at top:", await st());
console.log((await page.evaluate(() => (window as unknown as { __lost: string[] }).__lost)).join("\n"));
await b.close();
