import "../../../load-env";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { getDb, withPlatform, sql } from "@rentweb/db";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * modules_finish packet — browser checks (Playwright, dev servers on :3000 / :3001). Prints PASS/FAIL.
 *  AM-04   admin order print (print media): sender block + order number/date visible, app shell hidden
 *  RA-07   checkout: note textarea has a label; after a failed submit every invalid control points aria-describedby at its error text
 *  SBR-010 booking wizard step buttons ≥ 44×44 with an accessible name (done steps too)
 *  RA-10   module targets at 390: booking service/staff/package card CTAs + staff name links, commerce cart qty stepper, breadcrumbs ≥ 44 tall
 *  chat    salon home at 390: floating LINE button hidden while the embedded booking widget is on screen, back when scrolled away;
 *          at 1440 it stays; restaurant /menu hides the floating button but keeps the footer LINE link
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/modules_finish-ui-verify.ts [am04|ra07|sbr010|ra10|chat ...]
 */
let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const rows = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const only = new Set(process.argv.slice(2));
const want = (k: string) => !only.size || only.has(k);

async function ctxFor(browser: Browser, width: number): Promise<BrowserContext> {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, reducedMotion: "reduce", isMobile: mobile, hasTouch: mobile });
  await isolateHmr(ctx);
  // tsx (esbuild keepNames) wraps named helpers inside evaluate() callbacks in __name(...)
  await ctx.addInitScript({ content: "window.__name = (f) => f;" });
  return ctx;
}
/** goto, retrying a dev compile error / 500 twice (other agents edit files at the same time) */
async function go(page: Page, url: string) {
  for (let i = 0; ; i++) {
    const res = await stableGoto(page, url, "load");
    const bad = (res?.status() ?? 200) >= 500 || (await page.locator("nextjs-portal, [data-nextjs-dialog]").count()) > 0;
    if (!bad || i >= 2) return res;
    await page.waitForTimeout(10_000);
  }
}
type Box = { text: string; w: number; h: number };
const boxes = (page: Page, selector: string) =>
  page.$$eval(selector, (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { text: ((e.getAttribute("aria-label") || (e as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40)), w: Math.round(r.width), h: Math.round(r.height) };
      }),
  ) as Promise<Box[]>;
const fmt = (b: Box[]) => b.map((x) => `${x.text || "∅"} ${x.w}x${x.h}`).join("; ");

async function am04(browser: Browser) {
  console.log("— AM-04 admin order print");
  const db = getDb();
  const [o] = rows<{ id: string; number: string }>(
    await withPlatform(db, (tx) => tx.execute(sql`select o.id, o.number from orders o join tenants t on t.id = o.tenant_id where t.slug = 'demo-shop' and o.shipping_address is not null order by o.placed_at desc limit 1`)),
  );
  if (!o) return check(false, "no demo-shop order with a shipping address");
  const ctx = await ctxFor(browser, 1440);
  const page = await ctx.newPage();
  await go(page, "http://localhost:3001/login");
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click("button[type=submit]")]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await go(page, `http://localhost:3001/t/demo-shop/orders/${o.id}/print`);
    await page.emulateMedia({ media: "print" });
    const r = await page.evaluate(() => {
      const vis = (el: Element | null) => !!el && getComputedStyle(el).display !== "none" && (el as HTMLElement).getClientRects().length > 0;
      const sheet = document.querySelector(".print-sheet");
      const head = sheet?.querySelector("[data-print-sheet-head]") ?? null;
      const chrome = [...document.querySelectorAll("aside, header")].filter((e) => !sheet?.contains(e));
      return { head: vis(head), headText: (head as HTMLElement | null)?.innerText ?? "", chromeVisible: chrome.filter(vis).length, back: vis(document.querySelector("[data-print-hide]")) };
    });
    await page.emulateMedia({ media: "screen" });
    check(
      r.head && r.headText.includes("ผู้ส่ง") && r.headText.includes(o.number) && r.chromeVisible === 0 && !r.back,
      `print @${width}: sheet head ${r.head ? "visible" : "HIDDEN"} (ผู้ส่ง ${r.headText.includes("ผู้ส่ง")}, ${o.number} ${r.headText.includes(o.number)}), shell header/aside visible ${r.chromeVisible}, toolbar ${r.back ? "VISIBLE" : "hidden"}`,
    );
  }
  await ctx.close();
}

async function addToCart(page: Page, tenant: string) {
  const db = getDb();
  const [p] = rows<{ id: string }>(
    await withPlatform(db, (tx) =>
      tx.execute(
        sql`select p.id from products p join tenants t on t.id = p.tenant_id where t.slug = ${tenant} and p.status = 'active' and (p.track_inventory = false or p.stock > 3) and not exists (select 1 from product_variants v where v.product_id = p.id) order by p.created_at limit 1`,
      ),
    ),
  );
  if (!p) throw new Error(`no simple product on ${tenant}`);
  const res = await page.evaluate(async (id) => {
    const r = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, quantity: 1 }) });
    return r.status;
  }, p.id);
  if (res !== 200) throw new Error(`POST /api/cart ${res}`);
}

async function ra07(browser: Browser) {
  console.log("— RA-07 checkout a11y");
  for (const width of [390, 1440]) {
    const ctx = await ctxFor(browser, width);
    const page = await ctx.newPage();
    await go(page, "http://demo-shop.localhost:3000/products");
    await addToCart(page, "demo-shop");
    await go(page, "http://demo-shop.localhost:3000/checkout");
    const note = page.locator("textarea[name=note]");
    const noteName = await note.evaluate((el) => {
      const id = el.id;
      const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
      return (lab as HTMLElement | null)?.innerText.trim() || el.getAttribute("aria-label") || "";
    });
    check(!!noteName && (await page.getByLabel(noteName, { exact: true }).count()) >= 1, `@${width} note textarea labelled "${noteName}"`);
    // submit with a bad phone and no address → server errors
    await page.fill("#name", "คิวเอ ทดสอบ");
    await page.fill("#phone", "12");
    const delivery = page.locator('[role=radiogroup] input[type=radio], [role=radiogroup] [role=radio]');
    if ((await delivery.count()) > 0) await delivery.first().check({ force: true }).catch(() => delivery.first().click({ force: true }));
    await page.locator('#checkout-form button[type="submit"]:visible, button[form="checkout-form"][type="submit"]:visible').first().click();
    await page.locator("#phone[aria-invalid=true]").waitFor({ timeout: 60_000 }).catch(() => {});
    const r = await page.evaluate(() =>
      [...document.querySelectorAll("#checkout-form [aria-invalid=true]")].map((el) => {
        const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        const texts = ids.map((i) => document.getElementById(i)?.textContent?.trim() ?? "");
        return { name: el.getAttribute("name") || el.id || el.getAttribute("role") || el.tagName, ok: texts.length > 0 && texts.every(Boolean), texts: texts.join(" | ") };
      }),
    );
    const phone = r.find((x) => x.name === "phone");
    check(!!phone?.ok && r.every((x) => x.ok), `@${width} invalid controls → describedby: ${r.map((x) => `${x.name}${x.ok ? "✓" : "✗"}`).join(", ") || "none invalid"}; phone "${phone?.texts ?? "-"}"`);
    await ctx.close();
  }
}

async function sbr010(browser: Browser) {
  console.log("— SBR-010 booking wizard steps");
  const ctx = await ctxFor(browser, 390);
  const page = await ctx.newPage();
  for (const tenant of ["demo-salon", "demo-clinic"]) {
    await go(page, `http://${tenant}.localhost:3000/book`);
    await page.locator("ol button[aria-label^='ขั้นที่']").first().waitFor({ timeout: 60_000 });
    // pick the first service → step 1 becomes "done"
    await page.locator("button[aria-pressed]").first().click();
    await page.waitForTimeout(800);
    const steps = await page.$$eval("ol button[aria-label^='ขั้นที่']", (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { label: e.getAttribute("aria-label") ?? "", w: Math.round(r.width), h: Math.round(r.height), disabled: (e as HTMLButtonElement).disabled };
      }),
    );
    const done = steps.filter((s) => s.label.includes("เสร็จแล้ว"));
    check(
      steps.length >= 4 && steps.every((s) => s.w >= 44 && s.h >= 44 && /ขั้นที่ \d+ \S/.test(s.label)) && done.length >= 1,
      `${tenant} /book @390: ${steps.length} step buttons ${steps.map((s) => `${s.w}x${s.h}`).join(" ")}; done: ${done.map((d) => d.label).join(" | ")}`,
    );
    const measure = async (stepName: string) => {
      const all = await boxes(page, "main button");
      const small = all.filter((b) => b.w < 44 || b.h < 44);
      check(all.length > 0 && small.length === 0, `${tenant} /book @390 ${stepName} step: ${all.length} buttons, < 44px: ${fmt(small) || "none"}`);
    };
    await measure("staff");
    // staff: first option ("ใครก็ได้" / first staff) → date step
    await page.locator("main button[aria-pressed]").first().click();
    await page.locator(`.grid-cols-7 button[data-date]:not([aria-disabled="true"])`).first().waitFor({ timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await measure("date");
    // reverify-repro 2026-10-17: unavailable days are now aria-disabled (still focusable, not disabled) and picked by data-date
    const day = page.locator(`.grid-cols-7 button[data-date]:not([aria-disabled="true"])`).first();
    if (await day.count()) {
      await day.click();
      await page.waitForTimeout(1500);
      await measure("time");
    }
  }
  await ctx.close();
}

async function ra10(browser: Browser) {
  console.log("— RA-10 module touch targets @390");
  const ctx = await ctxFor(browser, 390);
  const page = await ctx.newPage();
  for (const [url, sel, what] of [
    ["http://demo-clinic.localhost:3000/services", "main a[href^='/book']", "service card CTA"],
    ["http://demo-clinic.localhost:3000/staff", "main a[href^='/book'], main a[href^='/staff/']", "staff card links + CTA"],
    ["http://demo-clinic.localhost:3000/packages", "main a[href^='/packages/']", "package card links + CTA"],
    ["http://demo-salon.localhost:3000/services", "main a[href^='/book'], main a[href^='/services/']", "salon service cards"],
    ["http://demo-shop.localhost:3000/collections/apparel", "nav[aria-label=breadcrumb] a", "collection breadcrumbs"],
    ["http://demo-shop.localhost:3000/products", "nav[aria-label=breadcrumb] a, main a[href^='/collections/'], main a[href='/products']", "catalog breadcrumbs + category pills"],
  ] as const) {
    await go(page, url);
    const all = await boxes(page, sel);
    const small = all.filter((b) => b.h < 44 || b.w < 24);
    check(all.length > 0 && small.length === 0, `${what} (${new URL(url).host.split(".")[0]}${new URL(url).pathname}): ${all.length} targets, small: ${fmt(small) || "none"}`);
  }
  // commerce cart stepper
  await go(page, "http://demo-shop.localhost:3000/products");
  await addToCart(page, "demo-shop");
  await go(page, "http://demo-shop.localhost:3000/cart");
  const stepper = await boxes(page, "main [role=group] button, main [role=group] input");
  check(stepper.length >= 3 && stepper.every((b) => b.h >= 44 && (b.text === "จำนวน" || b.w >= 44)), `cart qty stepper: ${fmt(stepper)}`);
  const crumbs = await boxes(page, "nav[aria-label=breadcrumb] a");
  check(crumbs.every((b) => b.h >= 44), `cart breadcrumbs: ${fmt(crumbs)}`);
  await ctx.close();
}

async function chat(browser: Browser) {
  console.log("— floating LINE button vs embedded booking widget");
  const state = (page: Page) =>
    page.evaluate(() => {
      const fc = document.querySelector("[data-floating-chat]");
      return { exists: !!fc, visible: !!fc && getComputedStyle(fc).display !== "none" && (fc as HTMLElement).getClientRects().length > 0, marker: !!document.querySelector("[data-hide-floating-chat]") };
    });
  for (const width of [390, 1440]) {
    const ctx = await ctxFor(browser, width);
    const page = await ctx.newPage();
    for (const tenant of ["demo-salon", "demo-clinic"]) {
      await go(page, `http://${tenant}.localhost:3000/`);
      const top = await state(page);
      if (!top.exists) {
        check(true, `${tenant} @${width}: no floating chat configured — skipped`);
        continue;
      }
      await page.locator("[data-booking-widget-root]").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const inView = await state(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      const back = await state(page);
      if (width < 768) check(top.visible && !inView.visible && inView.marker && back.visible && !back.marker, `${tenant} @${width}: top ${top.visible} → widget in view ${inView.visible} → top again ${back.visible}`);
      else check(top.visible && inView.visible && back.visible, `${tenant} @${width}: button stays (top ${top.visible}, widget in view ${inView.visible})`);
    }
    await ctx.close();
  }
  const ctx = await ctxFor(browser, 390);
  const page = await ctx.newPage();
  await go(page, "http://demo-restaurant.localhost:3000/menu");
  const r = await page.evaluate(() => {
    const fc = document.querySelector("[data-floating-chat]");
    const footerLine = [...document.querySelectorAll("[data-site-footer] a[href^='https://line.me/']")];
    return {
      fcVisible: !!fc && getComputedStyle(fc).display !== "none",
      footerLine: footerLine.length,
      footerLineVisible: footerLine.filter((a) => getComputedStyle(a).display !== "none").length,
      styleHack: [...document.querySelectorAll("style")].some((s) => s.textContent?.includes('a[href^="https://line.me/"]')),
    };
  });
  check(!r.fcVisible && !r.styleHack && r.footerLineVisible === r.footerLine, `demo-restaurant /menu @390: floating ${r.fcVisible ? "VISIBLE" : "hidden"}, footer LINE links ${r.footerLineVisible}/${r.footerLine} visible, style hack ${r.styleHack}`);
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (want("am04")) await am04(browser);
    if (want("ra07")) await ra07(browser);
    if (want("sbr010")) await sbr010(browser);
    if (want("ra10")) await ra10(browser);
    if (want("chat")) await chat(browser);
  } finally {
    await browser.close();
  }
  console.log(fails ? `FAIL (${fails})` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  console.log("FAIL (error)");
  process.exit(1);
});
