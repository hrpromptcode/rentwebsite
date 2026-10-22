import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Showcase imagery for the platform site (docs/design/hi-end-direction.md §4.2): captures every demo home page.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/capture-showcase.ts [--only=shop,topup] [--skip-long] [--skip-m]
 * → apps/web/public/showcase/<key>.webp       1440×900 viewport, q 80 (≤ 180 KB)
 *   apps/web/public/showcase/<key>-m.webp     390×844 @2x = 780×1688 (≤ 160 KB)
 *   apps/web/public/showcase/<key>-long.webp  1440 full page → 960 wide, max 4800 tall (≤ 400 KB)
 * File names are stable: the platform pages reference them; re-run after the storefront redesign lands.
 */
const KEYS = ["shop", "topup", "clinic", "restaurant", "salon", "corporate", "cafe", "course", "hotel", "events"] as const;
const ONLY = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean));
const SKIP_LONG = process.argv.includes("--skip-long");
const SKIP_M = process.argv.includes("--skip-m");
const OUT = path.resolve(process.cwd(), "../apps/web/public/showcase");
/** storefronts with pinned (sticky) horizontal sections leave tall blank bands in a full-page capture → their LONG shot is
 *  taken under prefers-reduced-motion, where the kit lays those sections out statically */
const LONG_REDUCE = new Set(["hotel"]);
fs.mkdirSync(OUT, { recursive: true });

// sharp ships with next (pnpm store); resolve it from the web app so tooling needs no extra dependency
const req = createRequire(path.resolve(process.cwd(), "../apps/web/node_modules/next/package.json"));
const sharp = req("sharp") as typeof import("sharp");

const HIDE_CSS = `[data-floating-chat]{display:none!important} nextjs-portal{display:none!important} *{caret-color:transparent!important}`;

async function settle(page: Page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // walk down and back so in-view reveals / lazy images settle, then return to the top
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += Math.round(window.innerHeight * 0.7)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 140));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1600);
}

async function save(buf: Buffer, file: string, opts: { width?: number; maxHeight?: number; quality: number; budget: number }) {
  let q = opts.quality;
  for (;;) {
    let img = sharp(buf);
    if (opts.width) img = img.resize({ width: opts.width });
    let out = await img.webp({ quality: q, effort: 5 }).toBuffer();
    if (opts.maxHeight) {
      const meta = await sharp(out).metadata();
      if ((meta.height ?? 0) > opts.maxHeight) out = await sharp(out).extract({ left: 0, top: 0, width: meta.width!, height: opts.maxHeight }).webp({ quality: q, effort: 5 }).toBuffer();
    }
    if (out.length <= opts.budget || q <= 40) {
      fs.writeFileSync(file, out);
      return { kb: Math.round(out.length / 1024), q };
    }
    q -= 8;
  }
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
try {
  for (const key of KEYS) {
    if (ONLY.size && !ONLY.has(key)) continue;
    const url = `http://demo-${key}.localhost:3000/`;
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      await stableGoto(page, url, "load");
      await settle(page);
      const shot = await page.screenshot({ type: "png" });
      const r = await save(shot, path.join(OUT, `${key}.webp`), { quality: 80, budget: 180 * 1024 });
      console.log(`${key}.webp ${r.kb} KB q${r.q}`);
      if (!SKIP_LONG && LONG_REDUCE.has(key)) {
        const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await isolateHmr(rctx);
        const rpage = await rctx.newPage();
        await stableGoto(rpage, url, "load");
        await settle(rpage);
        const full = await rpage.screenshot({ type: "png", fullPage: true });
        const r2 = await save(full, path.join(OUT, `${key}-long.webp`), { width: 960, maxHeight: 4800, quality: 72, budget: 400 * 1024 });
        console.log(`${key}-long.webp ${r2.kb} KB q${r2.q} (reduced motion)`);
        await rctx.close();
      } else if (!SKIP_LONG) {
        const full = await page.screenshot({ type: "png", fullPage: true });
        const r2 = await save(full, path.join(OUT, `${key}-long.webp`), { width: 960, maxHeight: 4800, quality: 72, budget: 400 * 1024 });
        console.log(`${key}-long.webp ${r2.kb} KB q${r2.q}`);
      }
      await page.close();
      await ctx.close();
    }
    if (!SKIP_M) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      await stableGoto(page, url, "load");
      await settle(page);
      const shot = await page.screenshot({ type: "png" });
      const r = await save(shot, path.join(OUT, `${key}-m.webp`), { quality: 78, budget: 160 * 1024 });
      console.log(`${key}-m.webp ${r.kb} KB q${r.q}`);
      await page.close();
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
