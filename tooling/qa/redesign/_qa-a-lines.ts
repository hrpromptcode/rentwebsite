/** qa-a: how a heading wraps (text per rendered line). tsx qa/redesign/_qa-a-lines.ts <w> <selector> url url … */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [w, sel, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(w), height: 844 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
for (const url of urls) {
  const p = await ctx.newPage();
  await stableGoto(p, url, "load");
  await p.waitForTimeout(1200);
  const out = await p.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].slice(0, 12).map((h) => {
    const r = document.createRange();
    const lines: Record<number, string> = {};
    const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
      if (n.parentElement?.closest(".sr-only,[aria-hidden=true]") && !n.parentElement?.closest("[data-split]")) continue;
      for (let i = 0; i < n.data.length; i++) {
        r.setStart(n, i); r.setEnd(n, i + 1);
        const q = r.getClientRects()[0];
        if (!q || q.width === 0) continue;
        const k = Math.round(q.top / 8) * 8;
        lines[k] = (lines[k] ?? "") + n.data[i];
      }
    }
    const ov = h.getBoundingClientRect().right > innerWidth - 8 || [...h.querySelectorAll("*")].some((c) => c.getBoundingClientRect().right > h.getBoundingClientRect().right + 2);
    return (ov ? "OVERFLOW " : "") + Object.values(lines).map((t) => t.trim()).filter(Boolean).join(" ⏎ ");
  }), sel!);
  console.log(url.replace(/^http:\/\//, ""), "\n   " + out.join("\n   "));
  await p.close();
}
await b.close();
