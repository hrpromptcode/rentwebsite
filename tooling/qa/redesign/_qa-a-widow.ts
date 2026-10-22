/** qa-a: headings (h1–h3, [data-split]) whose wrapped last line is a widow (≤ 5 chars or < 22 % of the widest line).
 *  tsx qa/redesign/_qa-a-widow.ts <w,w> url url … */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const [ws, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
for (const w of ws!.split(",").map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  for (const url of urls) {
    const p = await ctx.newPage();
    try {
      await stableGoto(p, url, "load");
      await p.waitForTimeout(800);
      const out = await p.evaluate(() => {
        const res: string[] = [];
        for (const h of document.querySelectorAll<HTMLElement>("h1,h2,h3,blockquote p")) {
          if (h.closest("[aria-hidden=true],.sr-only,footer") || !h.offsetParent) continue;
          const r = document.createRange();
          const lines: Record<number, { t: string; l: number; rt: number }> = {};
          const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
            if (n.parentElement?.closest(".sr-only")) continue;
            for (let i = 0; i < n.data.length; i++) {
              r.setStart(n, i); r.setEnd(n, i + 1);
              const q = r.getClientRects()[0];
              if (!q || q.width === 0) continue;
              const k = Math.round((q.top + window.scrollY) / 6) * 6;
              const L = (lines[k] ??= { t: "", l: q.left, rt: q.right });
              L.t += n.data[i]; L.l = Math.min(L.l, q.left); L.rt = Math.max(L.rt, q.right);
            }
          }
          const arr = Object.values(lines).filter((x) => x.t.trim());
          if (arr.length < 2) continue;
          const widths = arr.map((x) => x.rt - x.l);
          const last = arr[arr.length - 1]!;
          const lastW = widths[widths.length - 1]!;
          const maxW = Math.max(...widths);
          const chars = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(last.t.trim())].length;
          if (chars <= 5 || lastW < maxW * 0.22) res.push(`${h.tagName} "${arr.map((x) => x.t.trim()).join(" ⏎ ")}"`);
        }
        return res;
      });
      if (out.length) console.log(`${w} ${url.replace(/^http:\/\//, "")}\n   ` + out.join("\n   "));
    } catch (e) { console.log(`${w} ${url} FAIL ${(e as Error).message.slice(0, 80)}`); }
    await p.close();
  }
  await ctx.close();
}
await b.close();
