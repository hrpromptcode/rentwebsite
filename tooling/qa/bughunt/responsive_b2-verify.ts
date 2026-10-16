import "../../load-env";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/**
 * responsive_b2 verifications:
 *   prereveal – fresh load at 390/768/1024 (motion on): can the page be scrolled sideways before the image-text block is revealed?
 *   staff     – every /staff/<slug> + /services/<slug> page of salon + clinic at 390: scrollWidth vs viewport
 *   obscured  – Tab to a control near the bottom: is the focused control under the floating LINE button?
 *   reveal768 – corporate home at 768 scrolled slowly: does every [data-reveal] block end visible?
 */
const parts = process.argv.slice(2);
const want = (p: string) => !parts.length || parts.includes(p);
const log = (...a: unknown[]) => console.log(...a);

async function prereveal(browser: Browser) {
  for (const [slug, route] of [["demo-cafe", "/"], ["demo-clinic", "/"], ["demo-corporate", "/"], ["demo-corporate", "/work"], ["demo-shop", "/"], ["demo-salon", "/"]] as const) {
    for (const w of [390, 768, 1024]) {
      const ctx = await newCtx(browser, w, "no-preference");
      const page = await ctx.newPage();
      await gotoRetry(page, origin(slug) + route);
      await page.waitForTimeout(3000);
      const r = (await page.evaluate(`(async () => { const sw = document.documentElement.scrollWidth, vw = document.documentElement.clientWidth; window.scrollTo(200, 0); await new Promise(r => setTimeout(r, 300)); const sx = scrollX;
        const off = [...document.querySelectorAll("[data-reveal]")].map(e => { const b = e.getBoundingClientRect(); return { right: Math.round(b.right + scrollX), top: Math.round(b.top + scrollY), tf: getComputedStyle(e).transform, op: getComputedStyle(e).opacity, dir: e.getAttribute("data-reveal") }; }).filter(o => o.right > vw);
        const bodyOx = getComputedStyle(document.body).overflowX, htmlOx = getComputedStyle(document.documentElement).overflowX;
        return { sw, vw, scrollXAfterScrollTo200: sx, bodyOx, htmlOx, offenders: off.slice(0, 3) }; })()`)) as Record<string, any>;
      log(`${slug}${route} @${w}: ${JSON.stringify(r)}`);
      if (r.scrollXAfterScrollTo200 > 0 && w === 390) await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-prereveal-${slug}${route.replace(/\//g, "_")}-${w}.png`) });
      await ctx.close();
    }
  }
}

async function staff(browser: Browser) {
  for (const slug of ["demo-salon", "demo-clinic"]) {
    const ctx = await newCtx(browser, 390, "reduce");
    const page = await ctx.newPage();
    const links: string[] = [];
    for (const list of ["/staff", "/services"]) {
      await gotoRetry(page, origin(slug) + list);
      const hrefs = (await page.evaluate(`[...document.querySelectorAll('main a[href^="${list}/"]')].map(a => a.getAttribute("href"))`)) as string[];
      links.push(...new Set(hrefs.map((h) => h.split("?")[0]!)));
    }
    for (const l of [...new Set(links)]) {
      await gotoRetry(page, origin(slug) + l);
      await page.waitForTimeout(800);
      const r = (await page.evaluate(`({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth })`)) as { sw: number; vw: number };
      log(`${slug}${l} @390 sw=${r.sw} vw=${r.vw}${r.sw > r.vw ? " OVERFLOW" : ""}`);
    }
    await ctx.close();
  }
}

async function obscured(browser: Browser) {
  const cases: [string, string, number, string][] = [
    ["demo-clinic", "/packages", 390, `el.innerText && /ซื้อแพ็กเกจ/.test(el.innerText)`],
    ["demo-clinic", "/services", 390, `el.innerText && /จองเลย/.test(el.innerText)`],
    ["demo-shop", "/cart", 1440, `el.getAttribute("href") === "/terms"`],
    ["demo-salon", "/staff", 390, `el.innerText && /จองกับ/.test(el.innerText)`],
  ];
  for (const [slug, route, w, pred] of cases) {
    const ctx = await newCtx(browser, w, "no-preference");
    const page = await ctx.newPage();
    await gotoRetry(page, origin(slug) + route);
    await page.waitForTimeout(2500);
    let hit = 0, covered = 0;
    const samples: string[] = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press("Tab");
      const ok = await page.evaluate(`(() => { const el = document.activeElement; return !!el && el !== document.body && (${pred}); })()`);
      if (!ok) continue;
      await page.waitForTimeout(900);
      hit++;
      const r = (await page.evaluate(`(() => { const el = document.activeElement; const b = el.getBoundingClientRect(); const pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.right - 6, b.bottom - 6], [b.right - 6, b.top + 6]]; const by = pts.map(([x, y]) => { const t = document.elementFromPoint(Math.min(innerWidth - 1, x), Math.min(innerHeight - 1, y)); return t && !el.contains(t) ? (t.closest("a.fixed, a[class*=fixed], [class*=fixed]") ? "FIXED:" + (t.closest("a,div").className || "").toString().slice(0, 40) : t.tagName) : "self"; }); return { rect: [b.left, b.top, b.width, b.height].map(Math.round), by, scrollY: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight }; })()`)) as { rect: number[]; by: string[]; scrollY: number; max: number };
      if (r.by.some((b) => b.startsWith("FIXED"))) {
        covered++;
        if (covered === 1) await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-obscured-${slug}${route.replace(/\//g, "_")}-${w}.png`) });
      }
      if (samples.length < 4) samples.push(JSON.stringify(r));
    }
    log(`${slug}${route} @${w}: matching focus stops=${hit} obscured=${covered} samples=${samples.join(" | ")}`);
    await ctx.close();
  }
}

async function reveal768(browser: Browser) {
  for (const w of [768, 1024]) {
    const ctx = await newCtx(browser, w, "no-preference");
    const page = await ctx.newPage();
    await gotoRetry(page, origin("demo-corporate") + "/");
    await page.waitForTimeout(2000);
    const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
    for (let y = 0; y < H; y += 250) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    const bad = await page.evaluate(`[...document.querySelectorAll("[data-reveal],[data-reveal-item]")].filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99).map(e => e.className.toString().slice(0, 60) + " op=" + getComputedStyle(e).opacity + " '" + (e.textContent||"").trim().slice(0, 30) + "'")`);
    log(`corporate / @${w} slow scroll: not revealed=${JSON.stringify(bad)}`);
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  if (want("prereveal")) await prereveal(browser);
  if (want("staff")) await staff(browser);
  if (want("obscured")) await obscured(browser);
  if (want("reveal768")) await reveal768(browser);
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
