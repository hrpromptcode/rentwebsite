import "../../../load-env";
import { chromium, type Browser } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * web_visual RA-02 + RA-03: after scrolling through a page, every <h1> (TextReveal words included) and every
 * revealed block (Reveal / StaggerItem) must be visible at its final layout position — computed opacity 1,
 * identity transform, and the same CSS translate/scale as the reduced-motion render (so intentional offsets like
 * md:translate-y-10 are allowed, a leftover reveal start offset is not) — and the page must not scroll sideways.
 * Modes per page: reduce (baseline), motion (no-preference), nojs (JS disabled, no-preference). Prints PASS/FAIL.
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RA-02-03-verify.ts [--shots] [demo-x/path ...]
 */
const PAGES = [
  "demo-cafe/",
  "demo-corporate/",
  "demo-corporate/about",
  "demo-corporate/work",
  "demo-shop/",
  "demo-shop/products",
  "demo-shop/products/sofa-throw",
  "demo-salon/",
  "demo-restaurant/about",
  "demo-clinic/",
  "platform/", // apps/web (platform) landing, also uses TextReveal
];
const SHOTS = process.argv.includes("--shots");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PROBE = `((base) => {
  const isId = (t) => t === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t);
  const noTr = (t) => t === "none" || /^0px( 0px)?( 0px)?$/.test(t);
  const noSc = (t) => t === "none" || t === "1";
  const out = { h1: [], blocks: 0, bad: [], base: [], sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  const shown = (el) => el.getClientRects().length > 0;
  for (const h of document.querySelectorAll("h1")) {
    if (!shown(h)) continue;
    const cs = getComputedStyle(h);
    const words = [...h.querySelectorAll("span > span")];
    const hidden = words.filter((s) => {
      const pr = s.parentElement.getBoundingClientRect(), r = s.getBoundingClientRect(), c = getComputedStyle(s);
      const overlap = Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top);
      return Number(c.opacity) < 0.99 || overlap < r.height - 2 || !noTr(c.translate) || !isId(c.transform);
    });
    const label = (h.getAttribute("aria-label") || h.textContent || "").slice(0, 24);
    out.h1.push({ text: label, words: words.length, hiddenWords: hidden.length });
    if (Number(cs.opacity) < 0.99 || hidden.length) out.bad.push("h1:" + label + " hidden=" + hidden.length + "/" + words.length);
  }
  for (const el of document.querySelectorAll('[data-reveal], [data-reveal-item], [class*="motion-safe:opacity-0"]')) {
    if (!shown(el)) continue;
    const c = getComputedStyle(el);
    const exp = base && base[out.blocks] ? base[out.blocks] : { translate: c.translate, scale: c.scale };
    out.base.push({ translate: c.translate, scale: c.scale });
    out.blocks++;
    const sameTr = c.translate === exp.translate || (noTr(c.translate) && noTr(exp.translate));
    const sameSc = c.scale === exp.scale || (noSc(c.scale) && noSc(exp.scale));
    const ok = Number(c.opacity) >= 0.99 && sameTr && sameSc && isId(c.transform);
    if (!ok) out.bad.push(el.tagName + "." + String(el.className).split(" ").slice(0, 2).join(".") + " op=" + c.opacity + " tr=" + c.translate + "(exp " + exp.translate + ") sc=" + c.scale + " tf=" + c.transform);
  }
  if (out.sw > out.cw + 1) out.bad.push("overflow " + out.sw + ">" + out.cw);
  return out;
})`;

type Base = { translate: string; scale: string }[];
async function run(browser: Browser, mode: "motion" | "reduce" | "nojs", width: number, target: string, base?: Base) {
  const [slug, ...rest] = target.split("/");
  const path = "/" + rest.join("/");
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    reducedMotion: mode === "reduce" ? "reduce" : "no-preference",
    javaScriptEnabled: mode !== "nojs",
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const hydration: string[] = [];
  page.on("console", (m) => m.type() === "error" && /hydrat|did not match/i.test(m.text()) && hydration.push(m.text().slice(0, 160)));
  await stableGoto(page, slug === "platform" ? `http://localhost:3000${path}` : `http://${slug}.localhost:3000${path}`);
  if (mode !== "nojs") {
    await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 250) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 150)); } await new Promise(r => setTimeout(r, 400)); window.scrollTo({ top: 0, behavior: "instant" }); })()`);
    await page.waitForTimeout(2500);
  }
  const r = (await page.evaluate(`(${PROBE})(${JSON.stringify(base ?? null)})`)) as { h1: unknown[]; blocks: number; bad: string[]; base: Base };
  if (SHOTS) await page.screenshot({ path: `screenshots/web_visual-reveal-${slug}${path.replace(/\//g, "_")}-${width}-${mode}.png` });
  await ctx.close();
  const bad = [...r.bad, ...hydration.map((h) => "hydration: " + h)];
  const ok = bad.length === 0 && r.h1.length > 0;
  return { base: r.base, ok, line: `${ok ? "ok  " : "FAIL"} ${mode.padEnd(6)} ${width} ${target} h1=${JSON.stringify(r.h1)} blocks=${r.blocks}${bad.length ? " BAD: " + bad.slice(0, 4).join(" | ") + (bad.length > 4 ? ` (+${bad.length - 4})` : "") : ""}` };
}

async function main() {
  const browser = await chromium.launch();
  let fails = 0;
  for (const width of [390, 1440]) {
    for (const target of ONLY.length ? ONLY : PAGES) {
      let base: Base | undefined;
      for (const mode of ["reduce", "motion", "nojs"] as const) {
        const r = await run(browser, mode, width, target, base);
        if (mode === "reduce") base = r.base;
        if (!r.ok) fails++;
        console.log(r.line);
      }
    }
  }
  await browser.close();
  console.log(fails ? `FAIL ${fails} page checks` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
