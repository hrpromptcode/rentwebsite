/** qa-a: computed style + child structure of a heading. tsx qa/redesign/_qa-a-h1style.ts <w> <selector> url */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [w, sel, url] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(w), height: 844 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
const p = await ctx.newPage();
await stableGoto(p, url!, "load");
await p.waitForTimeout(1200);
console.log(await p.evaluate((s) => {
  const h = document.querySelector<HTMLElement>(s)!;
  const cs = getComputedStyle(h);
  const kids = [...h.querySelectorAll<HTMLElement>("*")].slice(0, 30).map((k) => { const r = k.getBoundingClientRect(); const c = getComputedStyle(k); return `${k.tagName.toLowerCase()}.${String(k.className).slice(0, 50)} d=${c.display} ws=${c.whiteSpace} w=${Math.round(r.width)} "${(k.textContent ?? "").slice(0, 24)}"`; });
  return JSON.stringify({ fs: cs.fontSize, w: h.getBoundingClientRect().width, maxW: cs.maxWidth, wrap: cs.textWrap, ls: cs.letterSpacing, cls: h.className, html: h.outerHTML.slice(0, 1500), kids }, null, 1);
}, sel!));
await b.close();
