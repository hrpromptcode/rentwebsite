/**
 * qa-a probes (one context at a time): PageIntro h1 reveal state on CMS pages, category-index hover preview,
 * home scroll FPS after warm-up, live canvases per viewport while scrolling.
 *   cd tooling && pnpm exec tsx qa/redesign/qa-a-probe.ts [--only=intro,hover,fps,canvas] [--w=1440]
 */
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = new Set((arg("only") ?? "intro,hover,fps,canvas").split(","));
const W = Number(arg("w") ?? 1440);
const OUT = path.resolve(process.cwd(), "screenshots");
const host = (k: string) => `http://demo-${k}.localhost:3000`;

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: W, height: W >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: W < 768, hasTouch: W < 768, locale: "th-TH" });
await isolateHmr(ctx);
await ctx.addInitScript({ content: "window.__name = (f) => f;" });
const out: string[] = [];
const log = (s: string) => { out.push(s); console.log(s); };

async function fps(page: Page, ms = 6000) {
  const p = page.evaluate(
    (dur) =>
      new Promise<{ fps: number; long: number; worst: number; p95: number }>((res) => {
        const ts: number[] = [];
        const t0 = performance.now();
        const tick = (t: number) => { ts.push(t); if (t - t0 < dur) requestAnimationFrame(tick); else { const d = ts.slice(1).map((v, i) => v - ts[i]!).sort((a, b) => a - b); res({ fps: Math.round((ts.length - 1) / ((ts.at(-1)! - ts[0]!) / 1000)), long: d.filter((x) => x > 50).length, worst: Math.round(d.at(-1)!), p95: Math.round(d[Math.floor(d.length * 0.95)]!) }); } };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  for (let i = 0; i < Math.round(ms / 140); i++) { await page.mouse.wheel(0, 110); await page.waitForTimeout(120); }
  return p;
}

if (ONLY.has("intro")) {
  for (const [k, p] of [["corporate", "/careers"], ["corporate", "/about"], ["corporate", "/services"], ["shop", "/about"], ["cafe", "/about"]] as const) {
    const page = await ctx.newPage();
    await stableGoto(page, host(k) + p, "load");
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => {
      const h = document.querySelector("h1");
      if (!h) return "no h1";
      const u = h.querySelector("[data-split-unit]");
      const cs = u ? getComputedStyle(u) : null;
      return `state=${h.getAttribute("data-split-state")} unitTransform=${cs?.transform} unitOpacity=${cs?.opacity} rect=${Math.round(h.getBoundingClientRect().top)}`;
    });
    log(`intro ${k}${p}: ${r}`);
    await page.screenshot({ path: path.join(OUT, `redesign-qa-a-probe-intro-${k}${p.replace(/\//g, "-")}-${W}.png`) });
    await page.close();
  }
}

if (ONLY.has("hover") && W >= 768) {
  const page = await ctx.newPage();
  await stableGoto(page, host("shop") + "/collections", "load");
  await page.waitForTimeout(2500);
  const rows = page.locator(".rwc-index-row");
  const n = await rows.count();
  for (let i = 0; i < Math.min(n, 2); i++) {
    const b = await rows.nth(i).boundingBox();
    if (!b) continue;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2, { steps: 8 });
    await page.mouse.move(b.x + b.width * 0.45, b.y + b.height / 2, { steps: 8 });
    await page.waitForTimeout(900);
    const vis = await page.evaluate(() => [...document.querySelectorAll("img")].filter((im) => { const r = im.getBoundingClientRect(); const cs = getComputedStyle(im); return r.width > 150 && r.top < innerHeight && r.bottom > 0 && Number(cs.opacity) > 0.5 && !im.classList.contains("rwc-index-thumb"); }).length);
    log(`hover shop/collections row ${i}: preview images visible=${vis}`);
    await page.screenshot({ path: path.join(OUT, `redesign-qa-a-probe-hover-${i}-${W}.png`) });
  }
  await page.close();
}

if (ONLY.has("fps")) {
  for (const k of ["shop", "cafe", "corporate"]) {
    const page = await ctx.newPage();
    await stableGoto(page, host(k) + "/", "load");
    await page.waitForTimeout(4000);
    // warm-up pass (compiles lazy chunks, mounts scenes), then measure from the top again
    await fps(page, 4000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
    await stableGoto(page, host(k) + "/", "load");
    await page.waitForTimeout(3000);
    const f = await fps(page, 8000);
    log(`fps ${k} home ${W}: fps=${f.fps} p95=${f.p95}ms long>50=${f.long} worst=${f.worst}ms`);
    await page.close();
  }
}

if (ONLY.has("canvas")) {
  for (const [k, p] of [["corporate", "/"], ["corporate", "/work"], ["corporate", "/services"], ["shop", "/"], ["cafe", "/"]] as const) {
    const page = await ctx.newPage();
    await stableGoto(page, host(k) + p, "load");
    await page.waitForTimeout(2500);
    let max = 0;
    let at = 0;
    const vh = page.viewportSize()!.height;
    for (let i = 0; i < 40; i++) {
      const live = await page.evaluate(() => [...document.querySelectorAll("canvas")].filter((c) => { const r = c.getBoundingClientRect(); return c.width > 2 && r.width > 2 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(c).visibility !== "hidden"; }).length);
      if (live > max) { max = live; at = await page.evaluate(() => Math.round(scrollY)); }
      if (live > 1) await page.screenshot({ path: path.join(OUT, `redesign-qa-a-probe-canvas-${k}${p.replace(/\//g, "-") || "-home"}-${W}.png`) });
      const before = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, Math.round(vh * 0.45));
      await page.waitForTimeout(450);
      if ((await page.evaluate(() => scrollY)) - before < 5) break;
    }
    log(`canvas ${k}${p} ${W}: max live in viewport=${max} at y=${at}`);
    await page.close();
  }
}

await ctx.close();
await browser.close();
process.exit(0);
