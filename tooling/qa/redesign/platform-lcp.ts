import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Lighthouse-like sanity for the platform pages: LCP element + time and CLS (4× CPU throttle, warm dev server).
 *   cd tooling && pnpm exec tsx qa/redesign/platform-lcp.ts [/ /templates …] [--mobile]
 * Dev-mode numbers are pessimistic (unminified bundles); use them for the LCP *element* and CLS, not absolute timing.
 */
const paths = process.argv.slice(2).filter((a) => a.startsWith("/"));
const mobile = process.argv.includes("--mobile");
const browser = await chromium.launch();
for (const p of paths.length ? paths : ["/", "/templates", "/templates/shop", "/features", "/pricing"]) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  await ctx.addInitScript(() => {
    (window as unknown as { __lcp: unknown[]; __cls: number }).__lcp = [];
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { element?: Element; size: number })[]) {
        const el = e.element;
        (window as unknown as { __lcp: unknown[] }).__lcp.push({ t: Math.round(e.startTime), size: e.size, el: el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String((el as HTMLElement).className).slice(0, 50)}` : "?" });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  // warm the route once (dev compile), then measure a cold-cache-ish load with CPU throttling
  await stableGoto(page, `http://localhost:3000${p}`, "load");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`http://localhost:3000${p}`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({ lcp: (window as unknown as { __lcp: unknown[] }).__lcp, cls: (window as unknown as { __cls: number }).__cls }));
  const last = r.lcp[r.lcp.length - 1] as { t: number; el: string } | undefined;
  console.log(`${p} ${mobile ? "390" : "1440"}: LCP ${last?.t}ms ${last?.el} · CLS ${r.cls.toFixed(3)} · candidates ${r.lcp.length}`);
  await page.close();
  await ctx.close();
}
await browser.close();
