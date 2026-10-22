/** qa-a: list free Unsplash photo ids for a search. tsx qa/redesign/_qa-a-unsplash.ts "indigo dress" [max] */
import { chromium } from "@playwright/test";
const [q, maxArg] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto(`https://unsplash.com/s/photos/${encodeURIComponent(q!.replace(/\s+/g, "-"))}?license=free`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await p.waitForTimeout(3500);
for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 1600); await p.waitForTimeout(900); }
const ids = await p.evaluate(() => {
  const out: string[] = [];
  for (const im of document.querySelectorAll("img")) {
    const m = (im.currentSrc || im.src).match(/images\.unsplash\.com\/(photo-[\w-]+)/);
    if (m && !out.includes(m[1]!)) out.push(`${m[1]}  ${(im.alt || "").slice(0, 70)}`);
  }
  return out;
});
console.log(ids.slice(0, Number(maxArg ?? 24)).join("\n"));
await b.close();
