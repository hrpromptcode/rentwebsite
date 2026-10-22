/** qa-a: measure the product h1 (font size, container width, widest unit max-content). tsx qa/redesign/_qa-a-h1m.ts <w> url… */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [w, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(w), height: 900 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
for (const url of urls) {
  const p = await ctx.newPage();
  await stableGoto(p, url, "load");
  await p.waitForTimeout(1500);
  console.log(url.split("/").pop(), JSON.stringify(await p.evaluate(() => {
    const h = document.querySelector("h1")!;
    const cs = getComputedStyle(h);
    const units = [...h.querySelectorAll<HTMLElement>("[data-split-unit]")].map((u) => {
      const c = u.cloneNode(true) as HTMLElement;
      c.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;width:max-content";
      h.appendChild(c);
      const mw = c.getBoundingClientRect().width;
      c.remove();
      return `${u.textContent}:${Math.round(mw)}/${Math.round(mw / parseFloat(cs.fontSize) * 100) / 100}em`;
    });
    return { font: cs.fontSize, family: cs.fontFamily.slice(0, 30), box: Math.round(h.getBoundingClientRect().width), parent: Math.round(h.parentElement!.getBoundingClientRect().width), style: h.getAttribute("style")?.slice(0, 120), units };
  })));
  await p.close();
}
await b.close();
