import "../../load-env";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

/**
 * responsive_a11y bughunt: admin sweep at 390 and 1440 for demo-shop / demo-restaurant / demo-clinic sidebar pages
 * (overflow, a11y names/labels, console errors), dialog sizing at 390, and the mobile sidebar drawer.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_a11y-admin.ts [slug...] [--dialogs]
 */
const HERE = path.resolve("qa/bughunt");
const CHECKS = readFileSync(path.join(HERE, "responsive_a11y-checks.js"), "utf8").replace(/^\s*\/\/.*\n/, "").trim();
const OUT = path.join(HERE, "responsive_a11y-admin.jsonl");
const base = "http://localhost:3001";
const args = process.argv.slice(2);
const slugs = args.filter((a) => !a.startsWith("--"));
const tenants = slugs.length ? slugs : ["demo-shop", "demo-restaurant", "demo-clinic"];
const doDialogs = args.includes("--dialogs");

async function login(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.close();
}

async function sidebarLinks(page: Page, slug: string): Promise<string[]> {
  await page.goto(`${base}/t/${slug}/dashboard`, { waitUntil: "networkidle", timeout: 120_000 });
  const hrefs = (await page.evaluate(`[...document.querySelectorAll('nav[aria-label="เมนูหลัก"] a[href]')].map(a => a.getAttribute('href'))`)) as string[];
  return [...new Set(hrefs.filter((h) => h.startsWith(`/t/${slug}`) && !/topup/.test(h)))];
}

async function main() {
  const browser = await chromium.launch();
  const lctx = await browser.newContext();
  await login(lctx);
  const storageState = await lctx.storageState();
  await lctx.close();
  if (!slugs.length && !doDialogs) writeFileSync(OUT, "");
  for (const slug of tenants) {
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
    const p0 = await pctx.newPage();
    const links = await sidebarLinks(p0, slug);
    // add settings sub pages + a few detail pages
    for (const extra of ["/settings/payments", "/settings/domains", "/settings/team", "/settings/billing", "/settings/danger"]) links.push(`/t/${slug}${extra}`);
    const details: (string | null)[] = [];
    for (const lp of ["/orders", "/products", "/customers", "/pages", "/bookings", "/services", "/staff", "/clinic/patients", "/clinic/visits", "/restaurant/menu"]) {
        if (!links.includes(`/t/${slug}${lp}`)) continue;
        await p0.goto(`${base}/t/${slug}${lp}`, { waitUntil: "networkidle", timeout: 120_000 });
        const h = (await p0.evaluate(`(() => { const a = [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).find(h => h && new RegExp('^/t/${slug}${lp}/[^/]+$').test(h) && !/new$/.test(h)); return a || null; })()`)) as string | null;
        details.push(h);
    }
    links.push(...details.filter((h): h is string => !!h));
    await pctx.close();
    console.log(`[${slug}] ${links.length} pages: ${links.join(" ")}`);
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, storageState, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768 });
      for (const link of links) {
        const page = await ctx.newPage();
        const logs: string[] = [];
        page.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 300)));
        page.on("pageerror", (e) => logs.push("[pageerror] " + e.message.slice(0, 300)));
        try {
          const res = await page.goto(base + link, { waitUntil: "networkidle", timeout: 120_000 });
          await page.waitForTimeout(500);
          const r = (await page.evaluate(`(${CHECKS})(${JSON.stringify({ tap: false, contrast: width === 1440 })})`)) as Record<string, any>;
          // tables wider than their scroll container (scrollable is fine) and wide tables not in a scroll container
          const tables = (await page.evaluate(`[...document.querySelectorAll('table')].map(t => { let p = t.parentElement, sc = null; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { sc = p; break; } p = p.parentElement; } const r = t.getBoundingClientRect(); return { w: Math.round(r.width), cols: t.querySelectorAll('thead th').length, scroller: sc ? Math.round(sc.getBoundingClientRect().width) : null }; })`)) as { w: number; cols: number; scroller: number | null }[];
          if (doDialogs && width === 390) {
            const triggers = await page.locator('main [aria-haspopup="dialog"]:visible').all();
            for (const t of triggers.slice(0, 4)) {
              const label = ((await t.getAttribute("aria-label")) || (await t.innerText()).trim()).slice(0, 40);
              await t.click({ timeout: 5000 }).catch(() => {});
              await page.waitForTimeout(500);
              const d = (await page.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop(); if (!d) return null; const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); let scrollable = false; for (const el of [d, ...d.querySelectorAll('*')]) { const c = getComputedStyle(el); if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) scrollable = true; } return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), sh: d.scrollHeight, w: Math.round(r.width), oy: cs.overflowY, scrollable, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth }; })()`)) as Record<string, any> | null;
              const flag = d && (d.top < -1 || d.bottom > d.vh + 1) && !d.scrollable ? "DIALOG-CLIPPED" : d && d.w > d.vw ? "DIALOG-WIDE" : "";
              console.log(`   dialog '${label}' ${JSON.stringify(d)} ${flag}`);
              appendFileSync(OUT, JSON.stringify({ kind: "dialog", slug, link, label, d, flag }) + "\n");
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
            }
          }
          const rec = { kind: "page", slug, link, width, status: res?.status(), url: page.url(), title: await page.title(), logs: [...new Set(logs)].slice(0, 6), tables, r };
          if (!doDialogs) appendFileSync(OUT, JSON.stringify(rec) + "\n");
          const flags = [r.sw > r.vw ? `OVERFLOW ${r.sw}>${r.vw}` : "", r.overflow.length ? `offenders=${r.overflow.length}` : "", tables.some((t) => !t.scroller && t.w > width) ? "TABLE-NOSCROLL" : "", logs.length ? `ERR ${logs.length}` : "", r.noName.length ? `noName=${r.noName.length}` : "", r.noLabel.length ? `noLabel=${r.noLabel.length}` : ""].filter(Boolean);
          console.log(`${slug} ${width} ${res?.status()} ${link} ${flags.join(" ")}`);
        } catch (e) {
          console.log(`${slug} ${width} ERR ${link} ${(e as Error).message.slice(0, 150)}`);
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
