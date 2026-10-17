import "../../../load-env";
import { chromium } from "@playwright/test";
import { origin, gotoRetry, isolateHmr, scrollThrough } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-14 verify: small text on coloured surfaces reaches 4.5:1.
 *  - restaurant home reservation band (every text node inside the bg-primary column)
 *  - testimonial role lines (clinic / corporate home spotlight card)
 *  - every 12px uppercase eyebrow / chip on the 6 homes + clinic /packages + shop product page
 * Contrast is computed from the computed colours (rgb(), oklab() and color(srgb) are parsed, so color-mix tokens are
 * measured rather than skipped), with element + ancestor opacity applied and the first opaque ancestor background.
 * Run from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RESPONSIVE_B2-14-verify.ts
 */
const IN_PAGE = `(() => {
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const parse = (c) => {
    let m = c.match(/^rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { lin: p.slice(0, 3).map((v) => toLin(v / 255)), a: p.length > 3 ? p[3] : 1 }; }
    m = c.match(/^oklab\\(([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[ \\/]+/).filter(Boolean).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v)));
      const [L, A, B] = p;
      const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
      const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, v)));
      return { lin, a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/^color\\(srgb ([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ \\/]+/).filter(Boolean).map(Number); return { lin: p.slice(0, 3).map(toLin), a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  // blend in linear light is wrong for sRGB compositing; convert back to gamma space for blending
  const toGam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const blend = (fg, a, bg) => fg.map((v, i) => toLin(toGam(v) * a + toGam(bg[i]) * (1 - a)));
  const Y = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && n !== el) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = [1, 1, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i].lin, layers[i].a, base);
    return base;
  };
  const out = [];
  const seen = new Set();
  const check = (el, tag) => {
    if (seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return; // sr-only
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const rv = el.getBoundingClientRect();
    const pts = document.elementsFromPoint(rv.left + rv.width / 2, rv.top + rv.height / 2);
    if (pts.some((p) => p.tagName === "IMG" || p.tagName === "VIDEO")) return out.push({ tag, text: (el.innerText || "").trim().slice(0, 30), ratio: null, note: "over an image (not measurable)" });
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") return;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) return out.push({ tag, text: (el.innerText || "").trim().slice(0, 30), ratio: null, note: "unparsed/image bg " + cs.color });
    let op = 1;
    for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    const ink = blend(fg.lin, fg.a * op, bg);
    const [a, b] = [Y(ink), Y(bg)].sort((x, y) => y - x);
    const ratio = Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
    const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const need = fs >= 24 || (bold && fs >= 18.66) ? 3 : 4.5;
    out.push({ tag, text: (el.innerText || "").trim().slice(0, 30), ratio, need, fs, color: cs.color });
  };
  document.querySelectorAll("main p.uppercase.text-xs, main a.uppercase.text-xs, main span.text-xs.text-primary-ink, main [class*='text-primary-ink']").forEach((el) => check(el, "eyebrow"));
  const band = [...document.querySelectorAll("main .bg-primary")].find((e) => /จองโต๊ะ|เปิด/.test(e.textContent || ""));
  if (band) band.querySelectorAll("input, select").forEach((el) => check(el, "band-field"));
  if (band) band.querySelectorAll("p, span, a, h2").forEach((el) => { if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) check(el, "band"); });
  document.querySelectorAll("main .card.bg-primary blockquote ~ div div").forEach((el) => check(el, "testimonial"));
  return out;
})()`;

const PAGES: [string, string][] = [["demo-restaurant", "/"], ["demo-clinic", "/"], ["demo-corporate", "/"], ["demo-shop", "/"], ["demo-cafe", "/"], ["demo-salon", "/"], ["demo-clinic", "/packages"], ["demo-shop", "/products/sofa-throw"]];
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  let fail = 0, n = 0;
  for (const [slug, route] of PAGES) {
    await gotoRetry(page, origin(slug) + route);
    await scrollThrough(page);
    const res = (await page.evaluate(IN_PAGE)) as { tag: string; text: string; ratio: number | null; need?: number; note?: string; color?: string }[];
    for (const r of res) {
      n++;
      const bad = r.ratio !== null && r.ratio < (r.need ?? 4.5);
      if (bad) fail++;
      if (bad || r.tag !== "eyebrow" || r.ratio === null) console.log(`${bad ? "FAIL" : r.ratio === null ? "SKIP" : "ok  "} ${slug}${route} [${r.tag}] '${r.text}' ${r.ratio ?? r.note}${r.need ? " (need " + r.need + ")" : ""}`);
    }
    const eb = res.filter((r) => r.tag === "eyebrow" && r.ratio !== null).map((r) => r.ratio!);
    console.log(`     ${slug}${route}: ${eb.length} eyebrows/chips, min ${eb.length ? Math.min(...eb) : "-"}`);
  }
  await browser.close();
  console.log(fail ? `FAIL (${fail}/${n})` : `PASS (${n} text elements)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
