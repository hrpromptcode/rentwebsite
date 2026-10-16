import "../../load-env";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { HERE, TENANTS, origin, newCtx, watchConsole, gotoRetry, runChecks, otpLogin } from "./responsive_b2-lib";

/**
 * responsive_b2 storefront crawler: per tenant discover header/footer/mobile-nav + module + account routes, then at
 * 390/768/1024/1440 x reducedMotion no-preference/reduce run responsive_b2-checks.js at top, while scrolling and at max scroll.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-crawl.ts demo-shop demo-cafe
 * Raw results: qa/bughunt/responsive_b2-crawl.jsonl (one line per page x width x motion).
 */
const OUT = path.join(HERE, "responsive_b2-crawl.jsonl");
const args = process.argv.slice(2);
const slugs = args.filter((a) => !a.startsWith("--"));
const tenants = slugs.length ? slugs : TENANTS;
const WIDTHS = args.find((a) => a.startsWith("--widths="))?.slice(9).split(",").map(Number) ?? [390, 768, 1024, 1440];
const MODES = (args.find((a) => a.startsWith("--modes="))?.slice(8).split(",") as ("reduce" | "no-preference")[] | undefined) ?? ["no-preference", "reduce"];
const ONLY = args.find((a) => a.startsWith("--routes="))?.slice(9).split(",");
const OUTFILE = args.find((a) => a.startsWith("--out="))?.slice(6) ?? OUT;
const MODULE = ["/products", "/collections", "/cart", "/checkout", "/services", "/staff", "/book", "/packages", "/menu", "/order", "/reserve", "/account", "/account/orders", "/account/bookings", "/account/packages", "/orders/track", "/about", "/contact", "/privacy", "/terms", "/refund", "/gallery"];
const SKIP = /^\/(games|topup|wallet|account\/topups|api\/|_next)/;
const GUEST_ONLY = new Set(["/account/login"]);

async function discover(browser: Browser, slug: string, state: string): Promise<string[]> {
  const ctx = await newCtx(browser, 1440, "reduce", state);
  const page = await ctx.newPage();
  const set = new Set<string>(["/"]);
  const grab = async (p: string, scope: string) => {
    try {
      const res = await gotoRetry(page, origin(slug) + p);
      if (!res || res.status() >= 400) return [];
      const hrefs = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].map(a => a.getAttribute("href"))`)) as (string | null)[];
      return hrefs.filter((h): h is string => !!h && h.startsWith("/") && !h.startsWith("//")).map((h) => h.split("#")[0]!.split("?")[0]!);
    } catch {
      return [];
    }
  };
  for (const h of await grab("/", "header a[href], footer a[href], nav a[href]")) if (h && !SKIP.test(h)) set.add(h);
  // mobile nav sheet links (390)
  const mctx = await newCtx(browser, 390, "reduce", state);
  const mp = await mctx.newPage();
  try {
    await gotoRetry(mp, origin(slug) + "/");
    const btn = mp.locator('header button[aria-label="เปิดเมนู"], header button[aria-haspopup="dialog"]').first();
    if (await btn.count()) {
      await btn.click();
      await mp.waitForTimeout(800);
      const hrefs = (await mp.evaluate(`[...document.querySelectorAll("[role=dialog] a[href]")].map(a => a.getAttribute("href"))`)) as string[];
      for (const h of hrefs) if (h && h.startsWith("/") && !SKIP.test(h)) set.add(h.split("#")[0]!.split("?")[0]!);
    }
  } catch {}
  await mctx.close();
  for (const m of MODULE) {
    const res = await page.goto(origin(slug) + m, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
    if (res && res.status() < 400 && new URL(page.url()).pathname === m) set.add(m);
  }
  for (const [list, prefix] of [["/products", "/products/"], ["/collections", "/collections/"], ["/services", "/services/"], ["/staff", "/staff/"], ["/packages", "/packages/"]] as const) {
    if (!set.has(list)) continue;
    const hrefs = await grab(list, `main a[href^="${prefix}"]`);
    const first = hrefs.find((h) => h.length > prefix.length && !/qa-|%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A/i.test(h)) ?? hrefs[0];
    if (first) set.add(first);
  }
  await ctx.close();
  set.add("/account/login");
  return [...set].filter((p) => p && !SKIP.test(p));
}

async function stateFor(browser: Browser, slug: string) {
  const file = path.join(HERE, `responsive_b2-state-${slug}.json`);
  if (existsSync(file)) return file;
  const ctx = await newCtx(browser, 1280, "reduce");
  const page = await ctx.newPage();
  const phone = await otpLogin(page, slug);
  console.log(`[${slug}] signed in ${phone} -> ${page.url()}`);
  // put one item in the commerce cart so /cart + /checkout render their full state
  if (slug === "demo-shop" || slug === "demo-cafe") {
    await gotoRetry(page, origin(slug) + "/products");
    const hrefs = (await page.evaluate(`[...document.querySelectorAll('main a[href^="/products/"]')].map(a => a.getAttribute("href"))`)) as string[];
    for (const href of hrefs.slice(0, 4)) {
      await gotoRetry(page, origin(slug) + href);
      const add = page.getByRole("button", { name: /ใส่ตะกร้า|เพิ่มลงตะกร้า|หยิบใส่|เพิ่มในตะกร้า/ }).first();
      if ((await add.count()) && (await add.isEnabled())) {
        await add.click().catch(() => {});
        await page.waitForTimeout(2500);
        console.log(`[${slug}] added ${href} to cart`);
        break;
      }
    }
  }
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

async function checkPage(page: Page, logs: string[], slug: string, route: string, width: number, rm: string) {
  logs.length = 0;
  const res = await gotoRetry(page, origin(slug) + route);
  const status = res?.status() ?? 0;
  await page.waitForTimeout(2000);
  const finalPath = new URL(page.url()).pathname;
  const top = await runChecks(page, { tap: width === 390, contrast: width === 1440 && rm === "reduce" });
  // scroll through in viewport steps; at each stop look for fixed overlaps / covered controls
  const vh = page.viewportSize()!.height;
  const mid: string[] = [];
  const midFixed: string[] = [];
  const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  for (let y = Math.round(vh * 0.7); (width === 390 || width === 1440) && y < H - vh; y += Math.round(vh * 0.7)) {
    await page.evaluate(`window.scrollTo(0, ${y})`);
    await page.waitForTimeout(350);
    const r = await runChecks(page, { only: "covered" });
    for (const c of r.covered as string[]) if (!mid.includes(c)) mid.push(c);
    for (const c of r.fixedOverlap as string[]) if (!midFixed.includes(c)) midFixed.push(c);
    if (mid.length > 30) break;
  }
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await page.waitForTimeout(1500);
  const bottom = await runChecks(page, {});
  return {
    slug, route, finalPath, width, rm, status, title: await page.title(), logs: [...new Set(logs)].slice(0, 10), top, mid: mid.slice(0, 30), midFixed,
    bottom: { covered: bottom.covered, fixedOverlap: bottom.fixedOverlap, fixed: bottom.fixed, hidden: bottom.hidden, reveal: bottom.reveal, headClip: bottom.headClip, thaiClip: bottom.thaiClip, overflow: bottom.overflow, sw: bottom.sw, vw: bottom.vw },
  };
}

async function main() {
  const browser = await chromium.launch();
  if (!existsSync(OUTFILE)) writeFileSync(OUTFILE, "");
  for (const slug of tenants) {
    const state = await stateFor(browser, slug);
    const routes = ONLY ?? (await discover(browser, slug, state));
    console.log(`[${slug}] ${routes.length} routes: ${routes.join(" ")}`);
    for (const width of WIDTHS) {
      for (const rm of MODES.filter((m) => m === "no-preference" || width === 390 || width === 1440)) {
        const ctx = await newCtx(browser, width, rm, state);
        const gctx = await newCtx(browser, width, rm);
        const page = await ctx.newPage();
        const gpage = await gctx.newPage();
        const logs = watchConsole(page);
        const glogs = watchConsole(gpage);
        for (const route of routes) {
          const guest = GUEST_ONLY.has(route);
          try {
            const rec = await checkPage(guest ? gpage : page, guest ? glogs : logs, slug, route, width, rm);
            appendFileSync(OUTFILE, JSON.stringify({ ...rec, guest }) + "\n");
            const t = rec.top as Record<string, any>, b = rec.bottom as Record<string, any>;
            const flags = [
              t.sw > t.vw || b.sw > b.vw ? `OVERFLOW ${Math.max(t.sw, b.sw)}>${t.vw}` : "",
              t.hidden.length || b.hidden.length ? `HIDDEN ${b.hidden.length}` : "",
              t.headClip.length ? `HEADCLIP ${t.headClip.length}` : "",
              t.thaiClip.length || b.thaiClip.length ? `THAICLIP ${t.thaiClip.length}/${b.thaiClip.length}` : "",
              b.covered.length ? `COVERED ${b.covered.length}` : "",
              rec.mid.length ? `MIDCOVERED ${rec.mid.length}` : "",
              t.fixedOverlap.length || b.fixedOverlap.length || rec.midFixed.length ? "FIXEDOVERLAP" : "",
              rec.logs.length ? `LOGS ${rec.logs.length}` : "",
              rec.status >= 400 ? `STATUS ${rec.status}` : "",
              rec.finalPath !== route ? `-> ${rec.finalPath}` : "",
            ].filter(Boolean);
            console.log(`${slug} ${width} ${rm.padEnd(13)} ${rec.status} ${route} ${flags.join(" ")}`);
          } catch (e) {
            console.log(`${slug} ${width} ${rm} ERR ${route} ${(e as Error).message.slice(0, 200)}`);
            appendFileSync(OUTFILE, JSON.stringify({ slug, route, width, rm, error: (e as Error).message.slice(0, 300) }) + "\n");
          }
        }
        await ctx.close();
        await gctx.close();
      }
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
