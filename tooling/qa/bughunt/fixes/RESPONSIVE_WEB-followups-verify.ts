/**
 * responsive_web follow-ups (web_final packet), on the demo storefronts at 390 and 1440 (reduced motion, so reveal
 * transforms do not distort the measurements; the page is scrolled through first so every Reveal has settled):
 *  1. Thai ink of clamped text (line-clamp-*) is not clipped: responsive_b2-checks.js "thaiClip" has no entry > 1px
 *     for a line-clamp element (product titles, clinic service / staff blurbs, …);
 *  2. Thai display headings without TextReveal: no vertical overlap between the ink of one line (below marks) and the
 *     next line's stacked upper marks; also measured with the new rule removed from the stylesheet, to show it matters;
 *  3. RA-10 leftovers: no tap target under 44px tall on salon / clinic pages at 390 (service rows, card titles, CTAs).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/RESPONSIVE_WEB-followups-verify.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { done, launch, newCtx, shot } from "../admin_b2-lib";
import { isolateHmr, stableGoto } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra).slice(0, 600) : ""}`);
};
const CHECKS = readFileSync(path.resolve(process.cwd(), "qa", "bughunt", "responsive_b2-checks.js"), "utf8");
const ROUTES: Array<[string, string[]]> = [
  ["demo-shop", ["/", "/products"]],
  ["demo-cafe", ["/", "/products"]],
  ["demo-salon", ["/", "/services", "/staff"]],
  ["demo-clinic", ["/", "/services", "/packages", "/staff"]],
  ["demo-restaurant", ["/", "/menu"]],
  ["demo-corporate", ["/"]],
];

/** Per Thai display heading: smallest vertical gap between consecutive lines' ink (negative = marks overlap). */
const headingGaps = (page: Page) =>
  page.evaluate(() => {
    const THAI = /[฀-๿]/;
    const cv = document.createElement("canvas").getContext("2d")!;
    const out: Array<{ text: string; lh: string; fs: string; lines: number; minGap: number; reveal: boolean }> = [];
    for (const h of Array.from(document.querySelectorAll<HTMLElement>(".heading-display"))) {
      const r0 = h.getBoundingClientRect();
      if (!r0.width || !r0.height || h.closest("[aria-hidden=true], .sr-only")) continue;
      const text = (h.innerText || "").trim();
      if (!THAI.test(text)) continue;
      const cs = getComputedStyle(h);
      // ink box per grapheme cluster (base letter + its stacked marks), grouped by line; two lines "touch" where a
      // cluster's ink overlaps, horizontally AND vertically, the ink of a cluster on the line above
      const MARKS = "ัิีึืฺุู็่้๊๋์ํ๎";
      type Ink = { x1: number; x2: number; top: number; bottom: number };
      const lines = new Map<number, Ink[]>();
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const tn = walker.currentNode as Text;
        const s = tn.textContent ?? "";
        const pcs = getComputedStyle(tn.parentElement!);
        cv.font = `${pcs.fontStyle} ${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
        const fA = cv.measureText("ก").fontBoundingBoxAscent;
        for (let i = 0; i < s.length; ) {
          let j = i + 1;
          while (j < s.length && MARKS.includes(s[j]!)) j++;
          const cluster = s.slice(i, j);
          const start = i;
          i = j;
          if (!cluster.trim()) continue;
          range.setStart(tn, start);
          range.setEnd(tn, j);
          const cr = range.getBoundingClientRect();
          if (!cr.height || !cr.width) continue;
          const m = cv.measureText(cluster);
          const base = cr.top + fA;
          const key = Math.round(cr.top / 4);
          const L = lines.get(key) ?? [];
          L.push({ x1: cr.left, x2: cr.right, top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent });
          lines.set(key, L);
        }
      }
      const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      if (sorted.length < 2) continue;
      let minGap = Infinity;
      for (let i = 1; i < sorted.length; i++)
        for (const a of sorted[i - 1]!) for (const b of sorted[i]!) if (a.x1 < b.x2 && b.x1 < a.x2) minGap = Math.min(minGap, b.top - a.bottom);
      if (minGap === Infinity) minGap = 99;
      out.push({ text: text.slice(0, 30), lh: cs.lineHeight, fs: cs.fontSize, lines: sorted.length, minGap: Math.round(minGap * 10) / 10, reveal: !!h.querySelector("[data-reveal-mask]") });
    }
    return out;
  });

const browser = await launch();
try {
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const ctx = await newCtx(browser, { viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: "reduce", locale: "th-TH" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    for (const [slug, routes] of ROUTES) {
      for (const route of routes) {
        const tag = `[${vp.width}] ${slug}${route}`;
        const res = await stableGoto(page, `http://${slug}.localhost:3000${route}`, "load");
        if (!res || res.status() >= 400) {
          console.log(`SKIP ${tag} status ${res?.status()}`);
          continue;
        }
        const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
        for (let y = 0; y < H; y += 600) await page.evaluate((y) => window.scrollTo(0, y), y);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        const r = (await page.evaluate(`(${CHECKS})({ tap: true })`)) as { thaiClip: string[]; tap: string[] };
        const clampClip = r.thaiClip.filter((x) => /line-clamp/.test(x) && parseFloat(/clip=([\d.]+)/.exec(x)?.[1] ?? "0") > 1);
        check(`${tag} clamped Thai text not clipped`, clampClip.length === 0, clampClip);
        if (/products|services/.test(route)) {
          await page.evaluate(() => document.querySelectorAll<HTMLElement>("[class*=line-clamp-]").forEach((e) => e.style.setProperty("padding-top", "0px")));
          const before = (await page.evaluate(`(${CHECKS})({})`)) as { thaiClip: string[] };
          await page.evaluate(() => document.querySelectorAll<HTMLElement>("[class*=line-clamp-]").forEach((e) => e.style.removeProperty("padding-top")));
          console.log(`INFO ${tag} same page without the clamp padding: ${JSON.stringify(before.thaiClip.filter((x) => /line-clamp/.test(x)).map((x) => x.slice(0, 60)))}`);
        }
        const otherClip = r.thaiClip.filter((x) => !/line-clamp|sr-only/.test(x));
        if (otherClip.length) console.log(`INFO ${tag} other thaiClip (not in scope): ${JSON.stringify(otherClip).slice(0, 300)}`);
        const gaps = await headingGaps(page);
        const touching = gaps.filter((g) => g.minGap < 0);
        check(`${tag} Thai display headings: lines' marks do not overlap (${gaps.length} multi-line)`, touching.length === 0, touching);
        if (vp.width === 390 && /salon|clinic/.test(slug)) {
          const short = r.tap.filter((x) => {
            const m = / (\d+)x(\d+) /.exec(x);
            return !!m && +m[2]! < 44;
          });
          check(`${tag} no tap target under 44px tall`, short.length === 0, short);
        }
        if (vp.width === 390 && route === "/" && /clinic|shop/.test(slug)) await page.screenshot({ path: shot(`web_final-thai-${slug}-390`), fullPage: false });
      }
    }
    // synthetic non-TextReveal Thai display headings (page-title / reveal-off shapes) with stacked marks on every line
    await stableGoto(page, "http://demo-shop.localhost:3000/", "load");
    const synth = async (lineHeight: string | null) => {
      await page.evaluate((lh) => {
        document.getElementById("qa-headings")?.remove();
        const box = document.createElement("div");
        box.id = "qa-headings";
        box.style.cssText = "position:relative;z-index:99;background:#fff;padding:16px;width:min(900px,90vw)";
        for (const cls of ["heading-display text-5xl font-semibold", "heading-display text-[clamp(2.8rem,9vw,8.5rem)] font-semibold", "heading-display text-4xl font-semibold md:text-6xl"]) {
          const h = document.createElement("h2");
          h.className = cls;
          h.textContent = "ที่นี่ปั้นชิ้นงานใหม่ ทุกชิ้นที่ใส่ใจ ปู่ย่าคุ้นเคย";
          if (lh) h.style.lineHeight = lh;
          box.appendChild(h);
        }
        document.querySelector("main")!.prepend(box);
      }, lineHeight);
      const g = (await headingGaps(page)).filter((x) => x.text.startsWith("ที่นี่ปั้น"));
      return g;
    };
    const after = await synth(null);
    const before1 = await synth("1");
    const before095 = await synth("0.95");
    check(`[${vp.width}] synthetic Thai display headings (text-5xl / clamp size / text-6xl): no overlapping marks with the new leading`, after.length === 3 && after.every((g) => g.minGap >= 0 && parseFloat(g.lh) / parseFloat(g.fs) >= 1.249), after.map((g) => `fs=${g.fs} lh=${g.lh} lines=${g.lines} gap=${g.minGap}`));
    console.log(`INFO [${vp.width}] same headings at the old line-height 1: ${JSON.stringify(before1.map((g) => g.minGap))}; at 0.95: ${JSON.stringify(before095.map((g) => g.minGap))} (negative = marks overlap the line above)`);
    await synth(null);
    await page.locator("#qa-headings").screenshot({ path: shot(`web_final-thai-headings-${vp.width}`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
