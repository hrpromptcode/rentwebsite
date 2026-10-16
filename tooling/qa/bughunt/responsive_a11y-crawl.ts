import "../../load-env";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";

/**
 * responsive_a11y bughunt crawler: per tenant, discover nav + module routes, then at 390/768/1024/1440 run the in-page checks.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_a11y-crawl.ts [demo-shop ...]
 */
const HERE = path.resolve("qa/bughunt");
const CHECKS = readFileSync(path.join(HERE, "responsive_a11y-checks.js"), "utf8").replace(/^\s*\/\/.*\n/, "").trim();
const OUT = path.join(HERE, "responsive_a11y-crawl.jsonl");
const ALL = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tenants = slugs.length ? slugs : ALL;
const WIDTHS = [390, 768, 1024, 1440];
const MODULE = ["/products", "/collections", "/cart", "/checkout", "/services", "/staff", "/book", "/packages", "/menu", "/order", "/reserve", "/account", "/account/login", "/orders/track", "/about", "/contact", "/privacy", "/terms", "/refund"];
const SKIP = /^\/(games|topup|wallet|account\/topups)/;

async function discover(browser: Browser, slug: string): Promise<string[]> {
  const base = `http://${slug}.localhost:3000`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const set = new Set<string>(["/"]);
  const grab = async (p: string, scope: string) => {
    try {
      const res = await page.goto(base + p, { waitUntil: "networkidle", timeout: 90_000 });
      if (!res || res.status() >= 400) return [];
      const hrefs = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].map(a => a.getAttribute("href"))`)) as (string | null)[];
      return hrefs.filter((h): h is string => !!h && h.startsWith("/") && !h.startsWith("//")).map((h) => h.split("#")[0]!.split("?")[0]!);
    } catch {
      return [];
    }
  };
  for (const h of await grab("/", "header a[href], footer a[href], nav a[href]")) if (!SKIP.test(h) && h) set.add(h);
  for (const m of MODULE) {
    const res = await page.goto(base + m, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
    if (res && res.status() < 400) set.add(m);
  }
  // first detail page of each list
  for (const [list, prefix] of [["/products", "/products/"], ["/collections", "/collections/"], ["/services", "/services/"], ["/staff", "/staff/"], ["/packages", "/packages/"]] as const) {
    if (!set.has(list)) continue;
    const hrefs = await grab(list, `main a[href^="${prefix}"]`);
    const first = hrefs.find((h) => h.length > prefix.length && !/qa-|%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A/i.test(h)) ?? hrefs[0];
    if (first) set.add(first);
  }
  await page.close();
  return [...set].filter((p) => !SKIP.test(p));
}

async function main() {
  const browser = await chromium.launch();
  if (!slugs.length) writeFileSync(OUT, "");
  for (const slug of tenants) {
    const routes = await discover(browser, slug);
    console.log(`[${slug}] ${routes.length} routes: ${routes.join(" ")}`);
    for (const width of WIDTHS) {
      for (const rm of width === 390 || width === 1440 ? (["reduce", "no-preference"] as const) : (["reduce"] as const)) {
        const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: rm, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
        for (const route of routes) {
          const page = await ctx.newPage();
          const logs: string[] = [];
          page.on("console", (m) => {
            if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`);
          });
          page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.slice(0, 400)}`));
          let status = 0;
          try {
            const res = await page.goto(`http://${slug}.localhost:3000${route}`, { waitUntil: "networkidle", timeout: 90_000 });
            status = res?.status() ?? 0;
            await page.waitForTimeout(600);
            // scroll through to trigger in-view animations / lazy images
            await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 900)); })()`);
            const bottom = (await page.evaluate(`(${CHECKS})(${JSON.stringify({ tap: false, contrast: false })})`)) as Record<string, unknown>;
            await page.evaluate(`window.scrollTo(0, 0)`);
            await page.waitForTimeout(500);
            const top = (await page.evaluate(`(${CHECKS})(${JSON.stringify({ tap: width === 390 && rm === "reduce", contrast: width === 1440 && rm === "reduce" })})`)) as Record<string, unknown>;
            const rec = { slug, route, width, rm, status, title: await page.title(), logs: [...new Set(logs)].slice(0, 8), top, bottom: { covered: bottom.covered, fixedOverlap: bottom.fixedOverlap, fixed: bottom.fixed, hidden: bottom.hidden } };
            appendFileSync(OUT, JSON.stringify(rec) + "\n");
            const flags = [
              (top.sw as number) > (top.vw as number) ? `OVERFLOW ${top.sw}>${top.vw}` : "",
              (top.hidden as string[]).length || (bottom.hidden as string[]).length ? `HIDDEN ${(bottom.hidden as string[]).length}` : "",
              (bottom.covered as string[]).length ? `COVERED ${(bottom.covered as string[]).length}` : "",
              (top.fixedOverlap as string[]).length || (bottom.fixedOverlap as string[]).length ? "FIXEDOVERLAP" : "",
              logs.length ? `LOGS ${logs.length}` : "",
              status >= 400 ? `STATUS ${status}` : "",
            ].filter(Boolean);
            console.log(`${slug} ${width} ${rm.padEnd(13)} ${status} ${route} ${flags.join(" ")}`);
          } catch (e) {
            console.log(`${slug} ${width} ${rm} ERR ${route} ${(e as Error).message.slice(0, 200)}`);
            appendFileSync(OUT, JSON.stringify({ slug, route, width, rm, status, error: (e as Error).message.slice(0, 300), logs }) + "\n");
          }
          await page.close();
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
