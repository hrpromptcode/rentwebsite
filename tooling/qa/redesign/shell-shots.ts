/**
 * Storefront shell verification (shell agent): header (top / scrolled), footer, full-screen menu, operational route,
 * 404, keyboard focus, reduced motion — on all 10 demo sites at 1440×900 and 390×844. Collects console / hydration
 * errors and horizontal overflow. Screenshots: tooling/screenshots/redesign-shell-<site>-<view>-<w>.png
 * Run from tooling/: pnpm exec tsx qa/redesign/shell-shots.ts [--only=shop,cafe] [--skip-shots] [--checks]
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const OUT = "screenshots";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg("only")?.split(",");
const views = arg("views")?.split(",") ?? ["top", "scrolled", "footer", "menu", "op", "404"];
const widths = (arg("widths") ?? "1440,390").split(",").map(Number);
const checks = process.argv.includes("--checks");

const SITES: Array<{ key: string; op: string }> = [
  { key: "shop", op: "/cart" },
  { key: "topup", op: "/wallet" },
  { key: "clinic", op: "/book" },
  { key: "restaurant", op: "/menu" },
  { key: "salon", op: "/services" },
  { key: "corporate", op: "/contact" },
  { key: "cafe", op: "/checkout" },
  { key: "course", op: "/schedule" },
  { key: "hotel", op: "/stay" },
  { key: "events", op: "/events" },
];

const errors: string[] = [];
const notes: string[] = [];
function watch(page: Page, tag: string) {
  page.on("console", (m) => {
    const t = m.text();
    if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(t)) return;
    if (m.type() === "error" || /hydrat|did not match/i.test(t)) errors.push(`[${tag}] console.${m.type()}: ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message.slice(0, 300)}`));
}

async function ctxFor(browser: Browser, w: number, h: number, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}), ...extra });
  await isolateHmr(ctx);
  return ctx;
}

async function overflow(page: Page, tag: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  if (r.sw > r.vw + 1) notes.push(`[${tag}] horizontal overflow ${r.sw} > ${r.vw}`);
}

async function scrollToY(page: Page, y: number) {
  for (let i = 0; i < 80; i++) {
    const cur = await page.evaluate(() => window.scrollY);
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const target = Math.min(y, max);
    const d = target - cur;
    if (Math.abs(d) < 6) break;
    await page.mouse.wheel(0, Math.max(-900, Math.min(900, d)));
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(900);
}

async function site(browser: Browser, key: string, op: string, w: number) {
  const h = w < 768 ? 844 : 900;
  const base = `http://demo-${key}.localhost:3000`;
  const ctx = await ctxFor(browser, w, h);
  const page = await ctx.newPage();
  const tag = `${key}-${w}`;
  watch(page, tag);
  const shot = async (view: string) => {
    await page.screenshot({ path: `${OUT}/redesign-shell-${key}-${view}-${w}.png` });
    console.log("shot", key, view, w);
  };
  try {
    await stableGoto(page, base + "/", "load");
    await page.waitForTimeout(1800);
    const hdr = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-site-header]");
      return el ? { v: el.dataset.siteHeader, s: el.dataset.scrolled, t: el.dataset.transparent, d: el.dataset.onDark, h: el.getBoundingClientRect().height, route: document.documentElement.dataset.route } : null;
    });
    notes.push(`[${tag}] header ${JSON.stringify(hdr)}`);
    if (views.includes("top")) await shot("top");
    await overflow(page, `${tag} home`);
    if (views.includes("scrolled")) {
      await scrollToY(page, 900);
      const st = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[data-site-header]")!;
        return { s: el.dataset.scrolled, c: el.dataset.compact, h: Math.round(el.getBoundingClientRect().height), lenis: document.documentElement.classList.contains("lenis") };
      });
      notes.push(`[${tag}] scrolled ${JSON.stringify(st)}`);
      await shot("scrolled");
    }
    if (views.includes("footer")) {
      await scrollToY(page, 1e6);
      await page.waitForTimeout(1200);
      const ft = await page.evaluate(() => {
        const f = document.querySelector<HTMLElement>("[data-site-footer]");
        return f ? { layout: f.dataset.footerLayout, fits: f.dataset.fits, pos: getComputedStyle(f).position, h: Math.round(f.getBoundingClientRect().height) } : null;
      });
      notes.push(`[${tag}] footer ${JSON.stringify(ft)}`);
      await shot("footer");
    }
    if (views.includes("menu") && w < 768) {
      await scrollToY(page, 0);
      await page.getByRole("button", { name: "เปิดเมนู" }).first().click();
      await page.locator("[role=dialog] nav[aria-label='เมนูหลัก']").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(1400);
      await shot("menu");
      await page.keyboard.press("Escape");
      await page.locator("[role=dialog]").waitFor({ state: "hidden", timeout: 10_000 });
    }
    if (views.includes("op")) {
      await stableGoto(page, base + op, "load");
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({ route: document.documentElement.dataset.route, lenis: document.documentElement.classList.contains("lenis"), cursor: document.documentElement.hasAttribute("data-cursor-active") }));
      notes.push(`[${tag}] ${op} ${JSON.stringify(r)}`);
      await overflow(page, `${tag} ${op}`);
      await shot("op");
    }
    if (views.includes("404") && (w >= 768 || key === "topup" || key === "cafe")) {
      const res = await stableGoto(page, base + "/this-page-does-not-exist", "load");
      await page.waitForTimeout(1200);
      notes.push(`[${tag}] 404 status ${res?.status()}`);
      await shot("404");
    }
  } catch (e) {
    errors.push(`[${tag}] script: ${(e as Error).message.slice(0, 300)}`);
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function runChecks(browser: Browser) {
  // keyboard: Tab through the header of a site with a dropdown-free nav; every focused element must show an outline
  {
    const ctx = await ctxFor(browser, 1440, 900);
    const page = await ctx.newPage();
    watch(page, "kbd");
    await stableGoto(page, "http://demo-corporate.localhost:3000/", "load");
    await page.waitForTimeout(1200);
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName, name: (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30), outline: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", ring: cs.boxShadow !== "none", inHeader: !!a.closest("[data-site-header]") };
      });
      if (f) seen.push(`${f.tag}:${f.name}:${f.outline || f.ring ? "ring" : "NO-RING"}${f.inHeader ? ":hdr" : ""}`);
    }
    notes.push(`[kbd] ${seen.join(" | ")}`);
    await page.screenshot({ path: `${OUT}/redesign-shell-kbd-1440.png` });
    await page.close();
    await ctx.close();
  }
  // reduced motion: no Lenis, menu opens with no animation, content visible
  {
    const ctx = await ctxFor(browser, 390, 844, { reducedMotion: "reduce" });
    const page = await ctx.newPage();
    watch(page, "reduce");
    await stableGoto(page, "http://demo-shop.localhost:3000/", "load");
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains("lenis"), chatOpacity: getComputedStyle(document.querySelector("[data-floating-chat]") ?? document.body).opacity }));
    await page.getByRole("button", { name: "เปิดเมนู" }).first().click();
    await page.waitForTimeout(150);
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".rw-menu")!).animationName);
    notes.push(`[reduce] ${JSON.stringify({ ...r, menuAnim: anim })}`);
    await page.screenshot({ path: `${OUT}/redesign-shell-reduce-menu-390.png` });
    await page.keyboard.press("Escape");
    await page.close();
    await ctx.close();
  }
  // preloader (forced) on an expressive preset
  {
    const ctx = await ctxFor(browser, 1440, 900);
    const page = await ctx.newPage();
    watch(page, "preloader");
    await page.goto("http://demo-events.localhost:3000/?preloader=force", { waitUntil: "commit" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/redesign-shell-preloader-events-1440.png` });
    await page.waitForTimeout(2500);
    await page.close();
    await ctx.close();
  }
  // client navigation: transition + header active dot + route kind flips
  {
    const ctx = await ctxFor(browser, 1440, 900);
    const page = await ctx.newPage();
    watch(page, "nav");
    await stableGoto(page, "http://demo-shop.localhost:3000/", "load");
    await page.waitForTimeout(1500);
    const link = page.locator("[data-site-header] a.rw-nav-link").first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL((u) => u.pathname === href, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ path: location.pathname, route: document.documentElement.dataset.route, active: document.querySelector("[data-site-header] [aria-current=page]")?.textContent ?? null, dot: !!document.querySelector(".rw-nav-dot") }));
    await page.locator('header a[href="/cart"]').first().click();
    await page.waitForURL(/\/cart/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const r2 = await page.evaluate(() => ({ path: location.pathname, route: document.documentElement.dataset.route, lenis: document.documentElement.classList.contains("lenis") }));
    notes.push(`[nav] ${JSON.stringify(r)} → ${JSON.stringify(r2)}`);
    await page.close();
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  try {
    if (!process.argv.includes("--skip-shots")) {
      for (const s of SITES) {
        if (only && !only.includes(s.key)) continue;
        for (const w of widths) await site(browser, s.key, s.op, w);
      }
    }
    if (checks) await runChecks(browser);
  } finally {
    await browser.close();
  }
  console.log("\n--- notes");
  for (const n of notes) console.log(n);
  console.log(`\n--- errors (${errors.length})`);
  for (const e of errors) console.log(e);
})();
