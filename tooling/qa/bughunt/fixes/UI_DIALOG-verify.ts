/**
 * packages/ui DialogContent (restaurant_admin_b4 follow-up, root cause of RESPONSIVE_B2-02), web_final packet.
 *  - default panel: max-height calc(100dvh - 2rem) + internal scroll, 16px phone gutter even with a bare max-w-*;
 *  - <DialogBody> pattern: panel becomes a flex column with overflow hidden, only the body scrolls, header + close
 *    button + footer stay on screen;
 *  - existing dialogs still look right: admin "สร้างหน้าใหม่" (default), page editor "เพิ่มเซ็กชัน" (own max-h override),
 *    restaurant "จัดการหมวด" (ScrollDialogContent overrides) at 390x844, 390x600 and 1440x900;
 *  - the storefront build ships the same CSS (computed style of a probe element on demo-shop).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/UI_DIALOG-verify.ts
 */
import type { Page } from "@playwright/test";
import { and, eq, pages } from "@rentweb/db";
import { done, go, launch, newCtx, newPage, readCreds, shot, stateFor, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra).slice(0, 400) : ""}`);
};
const c = readCreds();
const T = (key: string) => c.tenants.find((t: { key: string }) => t.key === key) as { slug: string; id: string };
const shop = T("shop");
const rest = T("restaurant");
const [home] = await tt(shop.id, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.slug, "home"))).limit(1));

type M = { top: number; bottom: number; left: number; right: number; vw: number; vh: number; scrollH: number; clientH: number; overflowY: string; display: string; maxH: string; closeVisible: boolean };
const measure = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]')!;
    const r = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    const close = Array.from(d.querySelectorAll("button")).find((b) => b.textContent?.includes("ปิด"));
    const cr = close?.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, scrollH: d.scrollHeight, clientH: d.clientHeight, overflowY: cs.overflowY, display: cs.display, maxH: cs.maxHeight, closeVisible: !!cr && cr.top >= r.top - 1 && cr.bottom <= Math.min(r.bottom, innerHeight) + 1 && cr.width > 0 } as M;
  });
const fits = (m: M) => m.top >= 15 && m.bottom <= m.vh - 15 && m.left >= (m.vw < 640 ? 15 : 0) && m.right <= m.vw - (m.vw < 640 ? 15 : 0);
const settle = (page: Page) => page.waitForTimeout(450); // zoom-in animation

const browser = await launch();
try {
  const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
  for (const vp of [{ width: 390, height: 844 }, { width: 390, height: 600 }, { width: 1440, height: 900 }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await newCtx(browser, { storageState: st, viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
    await isolateHmr(ctx);
    const page = await newPage(ctx);

    // 1. default DialogContent: new page dialog
    await go(page, `/t/${shop.slug}/pages`);
    await page.getByRole("button", { name: /สร้างหน้าใหม่/ }).first().click();
    await page.locator('[role="dialog"][data-state="open"]').waitFor();
    await settle(page);
    let m = await measure(page);
    check(`[${tag}] new-page dialog fits the screen (16px gutter on phones), close button visible`, fits(m) && m.closeVisible, m);
    check(`[${tag}] default panel is capped at 100dvh-2rem and scrolls internally`, m.overflowY === "auto" && Math.abs(parseFloat(m.maxH) - (vp.height - 32)) <= 1, { maxH: m.maxH, overflowY: m.overflowY });
    // tall content (simulates a long form on a short phone): the panel stays on screen and scrolls
    await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][data-state="open"]')!;
      const tall = document.createElement("div");
      tall.id = "qa-tall";
      tall.style.height = "2000px";
      tall.textContent = "QA tall content";
      d.appendChild(tall);
    });
    m = await measure(page);
    check(`[${tag}] with 2000px of content the panel still fits and scrolls inside`, fits(m) && m.scrollH > m.clientH + 1000, m);
    await page.screenshot({ path: shot(`web_final-dialog-default-tall-${tag}`) });
    // DialogBody pattern: header + close stay while only the body scrolls
    await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][data-state="open"]')!;
      document.getElementById("qa-tall")!.remove();
      const body = document.createElement("div");
      body.setAttribute("data-slot", "dialog-body");
      body.className = "-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6";
      body.id = "qa-body";
      const inner = document.createElement("div");
      inner.style.height = "2000px";
      inner.textContent = "QA body";
      body.appendChild(inner);
      // the real form (fields + its footer) stays above; the probe body and a probe footer are appended as siblings
      const close = Array.from(d.children).find((el) => el.tagName === "BUTTON");
      d.insertBefore(body, close ?? null);
      const footer = document.createElement("div");
      footer.setAttribute("data-slot", "dialog-footer");
      footer.className = "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end";
      footer.innerHTML = '<button type="button" style="height:44px">QA footer action</button>';
      d.insertBefore(footer, close ?? null);
      d.querySelector('form [data-slot="dialog-footer"]')?.removeAttribute("data-slot");
    });
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]')!;
      const h = d.querySelector('[data-slot="dialog-header"]')!.getBoundingClientRect();
      const f = d.querySelector('[data-slot="dialog-footer"]')?.getBoundingClientRect() ?? null;
      const b = document.getElementById("qa-body")!;
      return { header: h.top, footerBottom: f?.bottom ?? null, bodyScrollable: b.scrollHeight > b.clientHeight, panelScroll: d.scrollHeight - d.clientHeight };
    });
    await page.evaluate(() => (document.getElementById("qa-body")!.scrollTop = 1500));
    m = await measure(page);
    const after = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]')!;
      return { header: d.querySelector('[data-slot="dialog-header"]')!.getBoundingClientRect().top, footerBottom: d.querySelector('[data-slot="dialog-footer"]')?.getBoundingClientRect().bottom ?? null };
    });
    check(`[${tag}] DialogBody: panel is a flex column without outer scroll, only the body scrolls`, m.display === "flex" && m.overflowY === "hidden" && before.bodyScrollable && before.panelScroll <= 1, { display: m.display, overflowY: m.overflowY, ...before });
    check(`[${tag}] DialogBody: header, close button and footer stay put on screen`, fits(m) && m.closeVisible && Math.abs(after.header - before.header) < 1 && after.footerBottom !== null && after.footerBottom <= vp.height, { before, after });
    await page.screenshot({ path: shot(`web_final-dialog-body-${tag}`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 2. section editor "เพิ่มเซ็กชัน" (consumer override max-h-[85dvh])
    if (home) {
      await go(page, `/t/${shop.slug}/pages/${home.id}`);
      await page.waitForTimeout(1500);
      if (await page.getByRole("dialog").isVisible().catch(() => false)) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
      await page.getByRole("button", { name: /เพิ่มเซ็กชัน/ }).first().click();
      await page.locator('[role="dialog"][data-state="open"]').waitFor();
      await settle(page);
      m = await measure(page);
      check(`[${tag}] editor add-section dialog (own 85dvh cap) fits and scrolls`, fits(m) && m.closeVisible && Math.abs(parseFloat(m.maxH) - vp.height * 0.85) <= 1 && (m.scrollH <= m.clientH + 1 || m.overflowY === "auto"), m);
      await page.screenshot({ path: shot(`web_final-dialog-addsection-${tag}`) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // 3. restaurant ScrollDialogContent (overrides: flex column, overflow hidden, sticky header/footer)
    await go(page, `/t/${rest.slug}/restaurant/menu`);
    const mgr = page.getByRole("button", { name: /จัดการหมวด/ }).first();
    if (await mgr.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await mgr.click();
      await page.locator('[role="dialog"][data-state="open"]').waitFor();
      await settle(page);
      m = await measure(page);
      const body = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"][data-state="open"]')!;
        const b = d.querySelector<HTMLElement>('[data-slot="dialog-body"]');
        return b ? { scroll: b.scrollHeight - b.clientHeight, overflowY: getComputedStyle(b).overflowY } : null;
      });
      check(`[${tag}] restaurant จัดการหมวด (ScrollDialogContent) unchanged: flex column, panel overflow hidden, body scrolls, fits`, fits(m) && m.closeVisible && m.display === "flex" && m.overflowY === "hidden" && body?.overflowY === "auto", { m, body });
      await page.screenshot({ path: shot(`web_final-dialog-restaurant-${tag}`) });
      await page.keyboard.press("Escape");
    } else {
      check(`[${tag}] restaurant menu manager button found`, false);
    }
    await ctx.close();
  }

  // 4. storefront CSS carries the same rules
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await isolateHmr(ctx);
  const sp = await ctx.newPage();
  await sp.goto("http://demo-shop.localhost:3000/", { waitUntil: "load", timeout: 120_000 });
  const probe = await sp.evaluate(() => {
    const d = document.createElement("div");
    d.className = "fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 max-sm:max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain has-[[data-slot=dialog-body]]:flex has-[[data-slot=dialog-body]]:flex-col has-[[data-slot=dialog-body]]:overflow-hidden";
    document.body.appendChild(d);
    const a = getComputedStyle(d);
    const r1 = { maxH: a.maxHeight, overflowY: a.overflowY, width: d.getBoundingClientRect().width };
    const b = document.createElement("div");
    b.setAttribute("data-slot", "dialog-body");
    d.appendChild(b);
    const r2 = { display: getComputedStyle(d).display, overflowY: getComputedStyle(d).overflowY };
    d.remove();
    return { r1, r2 };
  });
  check("storefront CSS: dialog cap, scroll, 16px phone gutter even with a bare max-w-md, DialogBody switch", probe.r1.maxH === "812px" && probe.r1.overflowY === "auto" && Math.abs(probe.r1.width - 358) <= 1 && probe.r2.display === "flex" && probe.r2.overflowY === "hidden", probe);
  await ctx.close();
} finally {
  await browser.close();
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
