/** sections agent: error / hydration / overflow checks for lab fx=calm|off and reduced-motion demo homes. */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const cases: Array<{ name: string; url: string; reduce?: boolean; w?: number }> = [
  { name: "lab-all-fx-off", url: "http://localhost:3000/lab/sections?fx=off" },
  //{ name: "lab-all-fx-calm", url: "http://localhost:3000/lab/sections?fx=calm&preset=neon" },
  //{ name: "lab-all-auto-candy", url: "http://localhost:3000/lab/sections?preset=candy" },
  //{ name: "lab-all-auto-390", url: "http://localhost:3000/lab/sections?preset=riviera", w: 390 },
  { name: "corporate-reduce", url: "http://demo-corporate.localhost:3000/", reduce: true },
  //{ name: "cafe-reduce-390", url: "http://demo-cafe.localhost:3000/", reduce: true, w: 390 },
];
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const c of cases) {
  const w = c.w ?? 1440;
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, reducedMotion: c.reduce ? "reduce" : "no-preference", isMobile: w < 768, hasTouch: w < 768 });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on("console", (m) => (m.type() === "error" || /hydrat|did not match/i.test(m.text())) && errs.push(m.text().slice(0, 220)));
  p.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 220)));
  const t0 = Date.now();
  await stableGoto(p, c.url, "load");
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 800) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(60); }
  await p.waitForTimeout(800);
  const res = await p.evaluate(() => {
    const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    // invisible text check: headings with computed opacity 0 after the full scroll (reduced motion must show everything)
    const hidden = [...document.querySelectorAll("main h1, main h2, main h3, main p")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      let n: Element | null = el; let op = 1;
      while (n && n !== document.body) { op *= Number(getComputedStyle(n).opacity); n = n.parentElement; }
      return op < 0.05;
    }).map((el) => {
      let n: Element | null = el; let who = "";
      while (n && n !== document.body) { if (Number(getComputedStyle(n).opacity) < 0.05) { who = `${n.tagName}.${String((n as HTMLElement).className).slice(0, 60)}`; break; } n = n.parentElement; }
      const sec = el.closest("[data-section]")?.getAttribute("data-section") ?? el.closest("[data-lab-sample]")?.getAttribute("data-lab-sample");
      return `${sec} :: ${el.tagName} "${(el.textContent ?? "").slice(0, 30)}" via ${who}`;
    });
    const sections = document.querySelectorAll("[data-section]").length;
    return { ov, hidden, sections };
  });
  console.log(`${c.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s h=${h} sections=${res.sections} overflow=${res.ov} hiddenText=${res.hidden.length} ${res.hidden.slice(0, 16).join(" | ")} errors=${errs.length}${errs.length ? "\n  " + [...new Set(errs)].slice(0, 5).join("\n  ") : ""}`);
  await p.close(); await ctx.close();
}
await b.close();
