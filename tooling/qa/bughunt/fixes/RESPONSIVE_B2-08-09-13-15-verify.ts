import "../../../load-env";
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { HERE, origin, newCtx, gotoRetry, watchConsole } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-08 / -09 / -13 / -15 verify (prints PASS/FAIL per check):
 *  08 restaurant home @390: Tab into the mini reservation form → the focused field's label shows a ring (box-shadow)
 *  09 shop + cafe /products @390/1440: no Tab stop is a ≤1px (sr-only) element; the no-JS submit is gone after hydration
 *  13 tap targets @390: account 'ออกจากระบบ', restaurant /reserve 'แสดงเวลาอื่น', shop product category chip ≥ 44px tall
 *  15 shop/clinic/restaurant @390: <html data-scroll-behavior="smooth"> and no "scroll-behavior: smooth" warning after
 *     client-side navigations
 * Run from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RESPONSIVE_B2-08-09-13-15-verify.ts
 */
let fails = 0;
const res = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};
async function tabTo(page: Page, pred: string, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(() => { const el = document.activeElement; return !!el && (${pred}); })()`)) return i + 1;
  }
  return -1;
}

async function main() {
  const browser = await chromium.launch();

  // 08
  {
    const ctx = await newCtx(browser, 390, "reduce");
    const page = await ctx.newPage();
    await gotoRetry(page, origin("demo-restaurant") + "/");
    for (const [name, pred] of [["date", `el.matches("form input[type=date]")`], ["time", `el.matches("form select") && el.closest("label") && /น\\./.test(el.textContent)`], ["party", `el.matches("form select") && /คน/.test(el.textContent)`]] as const) {
      const n = await tabTo(page, pred);
      await page.waitForTimeout(400); // let the box-shadow transition finish
      const r = (await page.evaluate(`(() => { const el = document.activeElement; const l = el.closest("label"); return { fv: el.matches(":focus-visible"), labelShadow: l ? getComputedStyle(l).boxShadow : "no label", border: l ? getComputedStyle(l).borderColor : "" }; })()`)) as { fv: boolean; labelShadow: string; border: string };
      // a visible ring = some shadow layer with a non-zero spread and a non-transparent colour
      const ring = hasRing(r.labelShadow);
      res(n > 0 && ring, `08 restaurant home mini form '${name}' focused after ${n} Tabs, focus-visible=${r.fv}, label box-shadow=${r.labelShadow.slice(0, 60)}`);
    }
    await ctx.close();
  }

  // 09
  for (const [slug, w] of [["demo-shop", 390], ["demo-shop", 1440], ["demo-cafe", 390]] as const) {
    const ctx = await newCtx(browser, w, "reduce");
    const page = await ctx.newPage();
    await gotoRetry(page, origin(slug) + "/products");
    await page.waitForTimeout(800);
    const fallback = await page.locator('form[role=search] button[type=submit].sr-only').count();
    const tiny: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const t = (await page.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; const r = el.getBoundingClientRect(); return el.tagName !== "NEXTJS-PORTAL" /* Next dev overlay */ && (r.width <= 1 || r.height <= 1) ? el.tagName + " '" + (el.innerText || el.getAttribute("aria-label") || "").trim() + "'" : null; })()`)) as string | null;
      if (t) tiny.push(t);
    }
    res(!tiny.length && fallback === 0, `09 ${slug}/products @${w}: invisible Tab stops in 40 Tabs=${JSON.stringify(tiny)}, sr-only fallback submit after hydration=${fallback}`);
    await ctx.close();
  }
  {
    // no-JS keeps the fallback (sort can still be applied)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(origin("demo-shop") + "/products", { waitUntil: "load", timeout: 120_000 });
    const n = await page.locator('form[role=search] button[type=submit]').count();
    res(n >= 1, `09 no-JS /products still renders the fallback submit (count=${n})`);
    await ctx.close();
  }

  // 13
  {
    const state = path.join(HERE, "responsive_b2-state-demo-shop.json");
    const ctx = await newCtx(browser, 390, "reduce", existsSync(state) ? state : undefined);
    const page = await ctx.newPage();
    await gotoRetry(page, origin("demo-shop") + "/account");
    const lo = page.locator("main form button[type=submit]").filter({ hasText: "ออกจากระบบ" }).first();
    if (await lo.count()) {
      const b = (await lo.boundingBox())!;
      res(b.height >= 44, `13 shop /account @390 'ออกจากระบบ' ${Math.round(b.width)}x${Math.round(b.height)}`);
    } else res(false, `13 shop /account: logout button not found (url=${page.url()}) — storage state not signed in?`);

    await gotoRetry(page, origin("demo-shop") + "/products/sofa-throw");
    const chip = page.locator('main a[href^="/collections/"]').first();
    const cb = (await chip.boundingBox())!;
    res(cb.height >= 44, `13 shop /products/sofa-throw @390 category chip '${(await chip.innerText()).trim()}' ${Math.round(cb.width)}x${Math.round(cb.height)}`);

    await gotoRetry(page, origin("demo-restaurant") + "/reserve");
    let more = page.locator("main button").filter({ hasText: /แสดงเวลาอื่น/ }).first();
    if (!(await more.count())) {
      // today may have ≤ 12 slots left: pick tomorrow
      const d = page.locator("main input[type=date]").first();
      if (await d.count()) {
        const t = new Date(Date.now() + 7 * 3600_000 + 86400_000).toISOString().slice(0, 10);
        await d.fill(t);
        await page.waitForTimeout(1500);
      }
      more = page.locator("main button").filter({ hasText: /แสดงเวลาอื่น/ }).first();
    }
    if (await more.count()) {
      const mb = (await more.boundingBox())!;
      res(mb.height >= 44, `13 restaurant /reserve @390 '${(await more.innerText()).trim()}' ${Math.round(mb.width)}x${Math.round(mb.height)}`);
    } else res(false, "13 restaurant /reserve: 'แสดงเวลาอื่น' button not rendered");
    await ctx.close();
  }

  // 15
  for (const slug of ["demo-shop", "demo-clinic", "demo-restaurant"]) {
    const ctx = await newCtx(browser, 390, "no-preference");
    const page = await ctx.newPage();
    const logs = watchConsole(page);
    await gotoRetry(page, origin(slug) + "/");
    const attr = await page.evaluate(`document.documentElement.getAttribute("data-scroll-behavior")`);
    const hrefs = (await page.evaluate(`[...new Set([...document.querySelectorAll('main a[href^="/"]')].map(a => a.getAttribute("href")).filter(h => !h.startsWith("/#") && !h.includes("?")))].slice(0, 3)`)) as string[];
    let navs = 0;
    for (const h of hrefs) {
      await page.evaluate("window.scrollTo(0, 600)");
      await page.locator(`main a[href="${h}"]`).first().click().catch(() => {});
      await page.waitForURL((u) => u.pathname === h.split("#")[0], { timeout: 30_000 }).then(() => navs++).catch(() => {});
      await page.waitForTimeout(1200);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1200);
    }
    const warn = logs.filter((l) => /scroll-behavior/i.test(l));
    res(attr === "smooth" && navs > 0 && !warn.length, `15 ${slug} @390 html[data-scroll-behavior]=${attr}, client navigations=${navs}, scroll-behavior warnings=${warn.length}`);
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `FAIL (${fails})` : "PASS (all)");
}
main().catch((e) => { console.error(e); process.exit(1); });

/** true when some box-shadow layer is a ring: spread > 0 and a colour that is not fully transparent */
function hasRing(shadow: string): boolean {
  const layers = shadow.split(/,(?![^(]*\))/);
  return layers.some((layer) => {
    const color = (layer.match(/(rgba?|oklab|oklch|color)\([^)]*\)/) ?? [""])[0];
    const lengths = layer.replace(color, "").trim().split(/\s+/).map((v) => parseFloat(v));
    const spread = lengths[3] ?? 0;
    const transparent = /rgba\(0, 0, 0, 0\)/.test(color) || /\/ 0\)$/.test(color) || /,\s*0\)$/.test(color);
    return spread > 0 && !transparent;
  });
}
