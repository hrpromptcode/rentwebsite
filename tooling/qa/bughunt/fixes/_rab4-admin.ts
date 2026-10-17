import "../../../load-env";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { HERE, SHOTS, CHECKS, isolateHmr, gotoRetry, watchConsole } from "../responsive_b2-lib";

/**
 * responsive_b2 admin sweep at 390 and 1440 (demo-shop, demo-restaurant, demo-clinic): sidebar pages + settings/* + detail/new pages:
 * page overflow, tables wider than the viewport without a scroll container, dialogs (every aria-haspopup=dialog trigger in main)
 * taller/wider than the viewport without scroll, the phone sidebar drawer (open, trap, Esc, focus return, link closes it), console errors.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-admin.ts [slug ...] [--no-dialogs]
 */
const OUT = path.join(HERE, "fixes", "_rab4-overflow.jsonl");
const base = "http://localhost:3001";
const args = process.argv.slice(2);
const slugs = args.filter((a) => !a.startsWith("--"));
const tenants = slugs.length ? slugs : ["demo-shop", "demo-restaurant", "demo-clinic"];
const STATE = path.join(HERE, "fixes", "_rab4-admin-state.json");
const log = (...a: unknown[]) => console.log(...a);

async function login(browser: Browser) {
  if (existsSync(STATE)) return STATE;
  const ctx = await browser.newContext();
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, `${base}/login`);
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}

async function discover(page: Page, slug: string) {
  await gotoRetry(page, `${base}/t/${slug}/dashboard`);
  const hrefs = (await page.evaluate(`[...document.querySelectorAll('nav[aria-label="เมนูหลัก"] a[href]')].map(a => a.getAttribute('href'))`)) as string[];
  const links = [...new Set(hrefs.filter((h) => h.startsWith(`/t/${slug}`) && !/topup/.test(h)))];
  // settings sub tabs + in-page sub navigation of module pages
  for (const p of [`/t/${slug}/settings`, ...links.filter((l) => /restaurant|clinic|products|orders|bookings/.test(l))]) {
    await gotoRetry(page, base + p);
    const sub = (await page.evaluate(`[...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href'))`)) as string[];
    for (const h of sub) {
      if (!h || !h.startsWith(`/t/${slug}/`) || /topup/.test(h) || links.includes(h.split("?")[0]!)) continue;
      const clean = h.split("#")[0]!;
      // one detail page per list + /new pages + settings tabs
      const parent = links.find((l) => clean.startsWith(l + "/"));
      if (clean.includes("?")) continue;
      if (/\/settings\//.test(clean) || /\/new$/.test(clean) || (parent && !links.some((l) => l.startsWith(parent + "/") && l !== clean && l.split("/").length === clean.split("/").length && !/\/new$/.test(l) && !/\/settings\//.test(l)))) links.push(clean);
    }
  }
  return [...new Set(links)].filter((l) => l.includes("/restaurant"));
}

async function dialogs(page: Page, slug: string, link: string) {
  const triggers = await page.locator('main [aria-haspopup="dialog"]:visible').all();
  const seen = new Set<string>();
  for (const t of triggers.slice(0, 8)) {
    const label = (((await t.getAttribute("aria-label")) || (await t.innerText().catch(() => ""))).trim() || "?").slice(0, 40);
    if (seen.has(label)) continue;
    seen.add(label);
    await t.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    const d = (await page.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop(); if (!d) return null; const r = d.getBoundingClientRect(); const cs = getComputedStyle(d);
      let scroller = null; for (const el of [d, ...d.querySelectorAll('*')]) { const c = getComputedStyle(el); if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) { scroller = el; break; } }
      const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent);
      const last = btns[btns.length - 1]; const lr = last ? last.getBoundingClientRect() : null;
      let wide = []; d.querySelectorAll('*').forEach(el => { const er = el.getBoundingClientRect(); if (er.width > 1 && (er.right > Math.min(r.right, innerWidth) + 1)) { let clipped = false; for (let a = el.parentElement; a && a !== d.parentElement; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') { clipped = true; break; } } if (!clipped) wide.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ').slice(0,3).join('.') : '') + ' R=' + Math.round(er.right)); } });
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width), oy: cs.overflowY, scrollable: !!scroller, vh: innerHeight, vw: innerWidth, lastBtn: last ? (last.innerText || last.getAttribute('aria-label') || '').trim().slice(0, 20) + ' bottom=' + Math.round(lr.bottom) : null, wide: wide.slice(0, 4) }; })()`)) as Record<string, any> | null;
    let flag = "";
    if (d) {
      if ((d.top < -1 || d.bottom > d.vh + 1) && !d.scrollable) flag = "DIALOG-CLIPPED";
      else if (d.w > d.vw + 1 || d.wide.length) flag = "DIALOG-WIDE";
    }
    // can the last button be brought into view (scroll the dialog's scroller / page)?
    if (d && flag === "" && d.bottom > d.vh + 1) {
      const reach = await page.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop(); const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent); const last = btns[btns.length-1]; last.scrollIntoView({ block: 'nearest' }); const r = last.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })()`);
      if (!reach) flag = "DIALOG-BUTTON-UNREACHABLE";
    }
    log(`   dialog '${label}' ${JSON.stringify(d)} ${flag}`);
    appendFileSync(OUT, JSON.stringify({ kind: "dialog", slug, link, width: page.viewportSize()!.width, label, d, flag }) + "\n");
    if (flag) await page.screenshot({ path: path.join(SHOTS, `fix-rab4-hunter-dialog-${slug}-${label.replace(/[^\w฀-๿]+/g, "_").slice(0, 20)}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    if (await page.locator("[role=dialog]:visible, [role=alertdialog]:visible").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
}

async function drawer(page: Page, slug: string) {
  await gotoRetry(page, `${base}/t/${slug}/dashboard`);
  const trig = page.locator('header button[aria-label="เปิดเมนู"]').first();
  if (!(await trig.isVisible().catch(() => false))) return log(`  [drawer ${slug}] NO visible menu button at 390`);
  await trig.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  const open = await page.locator("[role=dialog]:visible").count();
  const inDlg = await page.evaluate("!!document.activeElement.closest('[role=dialog]')");
  let left = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (!(await page.evaluate("!!document.activeElement.closest('[role=dialog]')"))) left++;
  }
  const box = await page.locator("[role=dialog]").first().evaluate((d) => { const r = d.getBoundingClientRect(); const nav = d.querySelector("nav"); return { w: Math.round(r.width), h: Math.round(r.height), navScroll: nav ? [nav.scrollHeight, nav.clientHeight, getComputedStyle(nav).overflowY] : null, links: d.querySelectorAll("a[href]").length }; });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const after = (await page.evaluate("(() => { const e = document.activeElement; return e === document.body ? 'body' : e.tagName.toLowerCase() + ' ' + (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 30); })()")) as string;
  log(`  [drawer ${slug}] open=${open} focusIn=${inDlg} Tab x40 left=${left} box=${JSON.stringify(box)} afterEsc focus=${after}`);
  // a link inside the drawer must navigate and close it
  await trig.click();
  await page.waitForTimeout(800);
  const link = page.locator("[role=dialog] a[href*='/customers']").first();
  if (await link.count()) {
    await link.click();
    await page.waitForURL(/\/customers/, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    log(`  [drawer ${slug}] after clicking ลูกค้า: url=${new URL(page.url()).pathname} drawerOpen=${await page.locator("[role=dialog]:visible").count()}`);
  }
  appendFileSync(OUT, JSON.stringify({ kind: "drawer", slug, open, inDlg, left, box, after }) + "\n");
}

async function main() {
  const browser = await chromium.launch();
  const state = await login(browser);
  if (!slugs.length) writeFileSync(OUT, "");
  for (const slug of tenants) {
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
    await isolateHmr(pctx);
    const links = await discover(await pctx.newPage(), slug);
    await pctx.close();
    log(`[${slug}] ${links.length} pages: ${links.join(" ")}`);
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, storageState: state, reducedMotion: "no-preference", isMobile: width < 768, hasTouch: width < 768 });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      const logs = watchConsole(page);
      if (width === 390) await drawer(page, slug);
      for (const link of links) {
        logs.length = 0;
        try {
          const res = await gotoRetry(page, base + link);
          await page.waitForTimeout(1200);
          const r = (await page.evaluate(`(${CHECKS})(${JSON.stringify({ tap: false, contrast: false })})`)) as Record<string, any>;
          const tables = (await page.evaluate(`[...document.querySelectorAll('table')].map(t => { let p = t.parentElement, sc = null; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { sc = p; break; } p = p.parentElement; } const r = t.getBoundingClientRect(); const cells = [...t.querySelectorAll('tbody tr:first-child td')].map(td => Math.round(td.getBoundingClientRect().width)); return { w: Math.round(r.width), cols: t.querySelectorAll('thead th').length, scroller: sc ? Math.round(sc.getBoundingClientRect().width) : null, cells }; })`)) as { w: number; cols: number; scroller: number | null; cells: number[] }[];
          const rec = { kind: "page", slug, link, width, status: res?.status(), url: page.url(), title: await page.title(), logs: [...new Set(logs)].slice(0, 6), tables, sw: r.sw, vw: r.vw, overflow: r.overflow, noName: r.noName, noLabel: r.noLabel, thaiClip: r.thaiClip, hidden: r.hidden, covered: r.covered, fixedOverlap: r.fixedOverlap };
          appendFileSync(OUT, JSON.stringify(rec) + "\n");
          const flags = [r.sw > r.vw ? `OVERFLOW ${r.sw}>${r.vw}` : "", r.overflow.length ? `offenders=${r.overflow.length}` : "", tables.some((t) => !t.scroller && t.w > width) ? "TABLE-NOSCROLL" : "", tables.some((t) => t.cells.some((c) => c > 0 && c < 48)) ? "NARROW-CELL" : "", logs.length ? `ERR ${logs.length}` : "", r.noName.length ? `noName=${r.noName.length}` : "", r.noLabel.length ? `noLabel=${r.noLabel.length}` : "", r.thaiClip.length ? `thai=${r.thaiClip.length}` : ""].filter(Boolean);
          log(`${slug} ${width} ${res?.status()} ${link} ${flags.join(" ")}`);
          if (width === 390 && !args.includes("--no-dialogs")) await dialogs(page, slug, link);
        } catch (e) {
          log(`${slug} ${width} ERR ${link} ${(e as Error).message.slice(0, 150)}`);
        }
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
