import "../../../load-env";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * web_visual RA-04 + SBR-018 + RA-09 + RA-10 (storefront shell bottom UI and touch targets). Prints PASS/FAIL.
 *  RA-04  at max scroll every footer link receives a click at its centre (not the LINE button / a sticky bar)
 *  SBR-018 /book renders no floating LINE button (also after client-side navigation), calendar cells hit-test themselves
 *  RA-09  LINE button label contrast >= 4.5:1
 *  RA-10  at 390: header actions, menu button, sheet close, footer links + social icons >= 44px tall (and wide for icons)
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RA-04-verify.ts [-v]
 */
const TENANTS = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  if (!ok || process.argv.includes("-v")) console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  return ok;
};

const FOOTER_HITS = `[...document.querySelectorAll("footer a")].filter((a) => a.getClientRects().length).map((a) => {
  const r = a.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const label = (a.textContent.trim() || a.getAttribute("aria-label") || "").slice(0, 20);
  if (cy > innerHeight || cy < 0) return { link: label, hit: "offscreen" };
  const top = document.elementFromPoint(cx, cy);
  if (top && (top === a || a.contains(top))) return { link: label, hit: "link" };
  // the top of a tall footer can sit under the sticky site header at max scroll: not bottom UI, scroll position artefact
  if (top && top.closest("header")) return { link: label, hit: "under-header" };
  if (top && top.tagName === "NEXTJS-PORTAL") return { link: label, hit: "dev-indicator" };
  return { link: label, hit: top ? (top.closest("[data-floating-chat],[data-sticky-bar]") ? "COVERED-BY " : "other ") + String((top.closest("a,button,div") || top).className).slice(0, 40) : "null" };
})`;

const CONTRAST = `(() => {
  const a = document.querySelector("[data-floating-chat]");
  if (!a) return null;
  const span = [...a.querySelectorAll("span")].find((s) => s.textContent.trim());
  const p = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const L = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const fg = L(p(getComputedStyle(span).color)), bg = L(p(getComputedStyle(a).backgroundColor));
  return Math.round(((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)) * 100) / 100;
})()`;

const SMALL_TARGETS = `(() => {
  const out = [];
  const sz = (el, where, needW) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    if (r.height < 43.5 || (needW && r.width < 43.5)) out.push(where + " " + Math.round(r.width) + "x" + Math.round(r.height) + " " + (el.textContent.trim() || el.getAttribute("aria-label") || "").slice(0, 20));
  };
  document.querySelectorAll("header a[aria-label], header button[aria-label]").forEach((el) => sz(el, "header", true));
  document.querySelectorAll("footer a").forEach((el) => sz(el, "footer", !!el.getAttribute("aria-label")));
  return out;
})()`;

const CELLS = `[...document.querySelectorAll("[role=gridcell]")].filter((c) => { const r = c.getBoundingClientRect(); return r.top >= 64 && r.bottom <= innerHeight; }).map((c) => {
  const r = c.getBoundingClientRect();
  const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  // NEXTJS-PORTAL = the dev-only Next.js indicator badge (bottom-left), absent in production
  return t === c || c.contains(t) || (t && t.tagName === "NEXTJS-PORTAL") ? "" : c.getAttribute("aria-label") + " under " + (t ? t.tagName + "." + String(t.className).slice(0, 40) : "null");
})`;

async function footerHits(page: Page) {
  await page.evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })`);
  await page.waitForTimeout(500);
  return (await page.evaluate(FOOTER_HITS)) as { link: string; hit: string }[];
}

async function main() {
  const browser = await chromium.launch();
  for (const slug of TENANTS) {
    for (const width of [390, 768, 1024, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768 });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      await stableGoto(page, `http://${slug}.localhost:3000/`);
      const hits = await footerHits(page);
      const bad = hits.filter((h) => h.hit.startsWith("COVERED") || h.hit.startsWith("other") || h.hit === "null");
      check(hits.some((h) => h.hit === "link") && bad.length === 0, `RA-04 ${slug} ${width} footer links=${hits.length} ${bad.length ? "BAD " + JSON.stringify(bad) : ""}`);
      if (width === 390) {
        const c = (await page.evaluate(CONTRAST)) as number | null;
        if (c !== null) check(c >= 4.5, `RA-09 ${slug} LINE label contrast ${c}:1`);
        const small = (await page.evaluate(SMALL_TARGETS)) as string[];
        check(small.length === 0, `RA-10 ${slug} 390 small targets: ${small.join(" | ") || "none"}`);
        const menu = page.getByRole("button", { name: "เปิดเมนู" });
        if (await menu.isVisible()) {
          // retry once: a click that lands before hydration does nothing
          for (let i = 0; i < 3 && !(await page.locator("[data-slot=sheet-content]").isVisible()); i++) {
            await menu.click();
            await page.waitForTimeout(1000);
          }
          const close = await page.getByRole("dialog").getByRole("button", { name: "ปิด" }).boundingBox();
          check(!!close && close.width >= 43.5 && close.height >= 43.5, `RA-10 ${slug} sheet close ${close ? Math.round(close.width) + "x" + Math.round(close.height) : "missing"}`);
        }
      }
      await ctx.close();
    }
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await stableGoto(page, `http://demo-shop.localhost:3000/products/sofa-throw`);
    const hits = await footerHits(page);
    const bad = hits.filter((h) => h.hit.startsWith("COVERED") || h.hit.startsWith("other") || h.hit === "null");
    check(hits.some((h) => h.hit === "link") && bad.length === 0, `RA-04 demo-shop /products/sofa-throw 390 (sticky bar) footer links=${hits.length} ${bad.length ? "BAD " + JSON.stringify(bad) : ""}`);
    await ctx.close();
  }
  for (const [slug, path] of [["demo-salon", "/book?service=thai-60&staff=nam"], ["demo-clinic", "/book?service=consult&staff=dr-kan"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));
    await stableGoto(page, `http://${slug}.localhost:3000${path}`);
    const fab = await page.locator("[data-floating-chat]").count();
    const cells = (await page.evaluate(CELLS)) as string[];
    const covered = cells.filter(Boolean);
    check(fab === 0 && cells.length > 0 && covered.length === 0, `SBR-018 ${slug} ${path} fab=${fab} fullyVisibleCells=${cells.length} covered=${JSON.stringify(covered.slice(0, 4))}`);
    await stableGoto(page, `http://${slug}.localhost:3000/`);
    const homeFab = await page.locator("[data-floating-chat]").count();
    const link = page.locator('main a[href^="/book"]').first();
    let afterNav = -1;
    let back = -1;
    if (await link.count()) {
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForURL(/\/book/, { timeout: 30_000 });
      await page.waitForTimeout(800);
      afterNav = await page.locator("[data-floating-chat]").count();
      await page.goBack();
      await page.waitForTimeout(1200);
      back = await page.locator("[data-floating-chat]").count();
    }
    check(homeFab === 1 && afterNav === 0 && back === 1 && !errors.some((e) => /hydrat/i.test(e)), `SBR-018 ${slug} home fab=${homeFab} -> client nav to /book fab=${afterNav} -> back fab=${back}${errors.length ? " errors=" + errors.slice(0, 2).join(" | ") : ""}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `FAIL ${fails}` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
