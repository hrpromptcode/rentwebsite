import "../../../load-env";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";

/**
 * restaurant_admin_b4 verification (RESPONSIVE_B2-02, RESPONSIVE_B2-03 + the /restaurant admin sweep at 390).
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/restaurant_admin_b4-verify.ts [--only dlg,menu,sweep]
 * Prints PASS/FAIL per check; screenshots → tooling/screenshots/fix-restaurant_admin_b4-*.png. Exit 1 when anything fails.
 *  - dlg:   'เพิ่มการจอง' at 390x844 / 390x667 / 1440x900: dialog inside the viewport, title + X + first field visible, submit visible
 *           without scrolling (sticky footer), the body scrolls and header/footer stay put.
 *  - menu:  /restaurant/menu at 390: no table on the page, every item card shows its name and its sold-out / visible / featured
 *           switches inside the viewport, no horizontal page scroll, sold-out toggle works from the card (and is reverted).
 *           At 768 / 1024 / 1280 / 1440 the table is shown and fits its container (no horizontal scroll), switches in the rows.
 *  - sweep: every /restaurant admin page at 390: no page overflow, no visible table wider than its scroller; every dialog
 *           opener (also the expanded add-category / add-menu-set forms) at 390x667: dialog inside the viewport, last button reachable.
 */
const ADMIN = "http://localhost:3001";
const SLUG = "demo-restaurant";
const BASE = `${ADMIN}/t/${SLUG}/restaurant`;
const SHOTS = path.resolve("screenshots");
mkdirSync(SHOTS, { recursive: true });
const SOLD_OUT_ITEM = "แกงจืดเต้าหู้หมูสับ";
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? process.argv[onlyArg + 1]!.split(",") : ["dlg", "menu", "tables", "history", "sweep"];

let fails = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `fix-restaurant_admin_b4-${name}.png`) });

async function login(browser: Browser) {
  const ctx = await browser.newContext();
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await stableGoto(page, `${ADMIN}/login`);
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

type State = Awaited<ReturnType<typeof login>>;
async function newPage(browser: Browser, state: State, width: number, height: number): Promise<{ ctx: BrowserContext; page: Page }> {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, storageState: state, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Geometry of the top-most open dialog: rect, scroller, title/close/last button positions. */
const DIALOG = `(() => {
  const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(e => e.getBoundingClientRect().height > 0).pop();
  if (!d) return null;
  const r = d.getBoundingClientRect();
  let scroller = null;
  for (const el of [d, ...d.querySelectorAll('*')]) { const c = getComputedStyle(el); if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) { scroller = el; break; } }
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; };
  const title = d.querySelector('[data-slot=dialog-title],h2');
  const close = [...d.querySelectorAll('button')].find(b => /ปิด/.test(b.textContent || '') && b.querySelector('.sr-only'));
  const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent && b !== close);
  const last = btns[btns.length - 1];
  const wide = [...d.querySelectorAll('*')].filter(el => { const b = el.getBoundingClientRect(); if (b.width < 2 || b.right <= innerWidth + 1) return false; for (let a = el.parentElement; a && a !== d; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return false; return true; }).length;
  return { vh: innerHeight, vw: innerWidth, rect: rect(d), title: title ? (title.textContent || '').trim() : '', titleRect: rect(title), closeRect: rect(close), last: last ? (last.innerText || last.getAttribute('aria-label') || '').trim().slice(0, 30) : null, lastRect: rect(last), scrollable: !!scroller, scrollerTag: scroller ? scroller.getAttribute('data-slot') || scroller.tagName.toLowerCase() : null, wide };
})()`;
type Dlg = { vh: number; vw: number; rect: number[]; title: string; titleRect: number[] | null; closeRect: number[] | null; last: string | null; lastRect: number[] | null; scrollable: boolean; scrollerTag: string | null; wide: number };
const inView = (r: number[] | null | undefined, vh: number, vw: number) => !!r && r[0]! >= -1 && r[1]! <= vh + 1 && r[2]! >= -1 && r[3]! <= vw + 1;

/** Last button of the dialog can be scrolled into view and is the element actually hit at its centre. */
const LAST_REACHABLE = `(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(e => e.getBoundingClientRect().height > 0).pop(); const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent); const last = btns[btns.length - 1]; if (!last) return true; last.scrollIntoView({ block: 'nearest' }); const r = last.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2)); return r.bottom <= innerHeight + 1 && r.top >= 0 && !!t && (last === t || last.contains(t)); })()`;

async function dialogReservation(browser: Browser, state: State) {
  for (const [w, h] of [[390, 844], [390, 667], [1440, 900]] as const) {
    const { ctx, page } = await newPage(browser, state, w, h);
    await stableGoto(page, `${BASE}/reservations`);
    await page.locator("main button").filter({ hasText: "เพิ่มการจอง" }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(500);
    const d = (await page.evaluate(DIALOG)) as Dlg;
    const tag = `B2-02 ${w}x${h}`;
    check(`${tag} dialog inside the viewport`, inView(d.rect, d.vh, d.vw), d.rect);
    check(`${tag} title + close button visible`, d.title === "เพิ่มการจอง" && inView(d.titleRect, d.vh, d.vw) && inView(d.closeRect, d.vh, d.vw), { title: d.titleRect, close: d.closeRect });
    const nameBox = await page.locator("#r-name").boundingBox();
    check(`${tag} first field (#r-name) visible and focused`, !!nameBox && nameBox.y >= 0 && nameBox.y + nameBox.height <= h && (await page.evaluate("document.activeElement?.id")) === "r-name", nameBox);
    check(`${tag} submit 'บันทึกการจอง' visible without scrolling`, /บันทึกการจอง/.test(d.last ?? "") && inView(d.lastRect, d.vh, d.vw), { last: d.last, rect: d.lastRect });
    check(`${tag} nothing wider than the viewport`, d.wide === 0 && d.rect[3]! - d.rect[2]! <= w - (w < 640 ? 32 : 0), { w: d.rect[3]! - d.rect[2]!, wide: d.wide });
    await shot(page, `resdlg-${w}x${h}`);
    if (w < 768) {
      check(`${tag} body scrolls internally`, d.scrollable && d.scrollerTag === "dialog-body", d.scrollerTag);
      if (!(await page.locator('[role=dialog] [data-slot="dialog-body"]').count())) {
        await ctx.close();
        continue;
      }
      // scroll the body with the wheel (touch-equivalent) and confirm header/footer stay put
      const body = page.locator('[role=dialog] [data-slot="dialog-body"]');
      const bb = (await body.boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(500);
      const after = (await page.evaluate(DIALOG)) as Dlg;
      const st = await body.evaluate((e) => e.scrollTop);
      check(`${tag} wheel scrolls the body; header + footer stay visible`, st > 0 && inView(after.titleRect, h, w) && inView(after.closeRect, h, w) && inView(after.lastRect, h, w), { scrollTop: st, title: after.titleRect, submit: after.lastRect });
      const cb = await page.getByRole("dialog").getByRole("checkbox").boundingBox();
      check(`${tag} last field (checkbox) reachable after scrolling`, !!cb && cb.y >= 0 && cb.y + cb.height <= (after.lastRect?.[0] ?? h), cb);
      await shot(page, `resdlg-${w}x${h}-scrolled`);
      // validation errors focus the first invalid field even when it is scrolled out of view
      await page.getByRole("dialog").locator('button[type="submit"]').click();
      await page.waitForFunction("document.activeElement?.id === 'r-name'", undefined, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const focus = await page.evaluate("document.activeElement?.id");
      const nb = await page.locator("#r-name").boundingBox();
      check(`${tag} empty submit focuses + reveals the first invalid field`, focus === "r-name" && !!nb && nb.y >= 0 && nb.y + nb.height <= h, { focus, y: nb?.y });
    }
    await ctx.close();
  }
}

const TABLES = `[...document.querySelectorAll('main table')].filter(t => t.getBoundingClientRect().width > 0).map(t => { let p = t.parentElement, sc = null; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { sc = p; break; } p = p.parentElement; } return { w: Math.round(t.getBoundingClientRect().width), scrollW: sc ? sc.scrollWidth : null, clientW: sc ? sc.clientWidth : null }; })`;
type Tbl = { w: number; scrollW: number | null; clientW: number | null };
const tableFits = (t: Tbl) => t.scrollW === null || t.scrollW <= (t.clientW ?? 0) + 1;

async function menuList(browser: Browser, state: State) {
  {
    const { ctx, page } = await newPage(browser, state, 390, 844);
    await stableGoto(page, `${BASE}/menu`);
    const tables = (await page.evaluate(TABLES)) as Tbl[];
    check("B2-03 390 no table shown on phones", tables.length === 0, tables);
    const sw = await page.evaluate("document.documentElement.scrollWidth");
    check("B2-03 390 no horizontal page scroll", (sw as number) <= 390, sw);
    const cards = (await page.evaluate(`[...document.querySelectorAll('ul[aria-label="รายการเมนู"] > li')].filter(li => li.getBoundingClientRect().height > 0).map(li => {
      const name = li.querySelector('[data-item-name]'); const nr = name.getBoundingClientRect();
      const sws = [...li.querySelectorAll('[role=switch]')].map(s => { const r = s.getBoundingClientRect(); return { label: s.getAttribute('aria-label'), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; });
      const price = li.querySelector('[data-item-price]'); const pr = price ? price.getBoundingClientRect() : null;
      return { name: name.textContent.trim().slice(0, 30), nameL: Math.round(nr.left), nameR: Math.round(nr.right), sws, priceR: pr ? Math.round(pr.right) : null, h: Math.round(li.getBoundingClientRect().height) };
    })`)) as { name: string; nameL: number; nameR: number; sws: { label: string; l: number; r: number; h: number }[]; priceR: number | null; h: number }[];
    check("B2-03 390 menu renders as a card list", cards.length > 0, `${cards.length} cards`);
    const bad = cards.filter((c) => c.nameL < 0 || c.nameR > 390 || c.sws.length !== 3 || c.sws.some((s) => s.l < 0 || s.r > 390) || c.priceR === null || c.priceR > 390);
    check("B2-03 390 every card: name, price and the 3 switches inside the viewport", bad.length === 0, bad.slice(0, 2));
    check("B2-03 390 switch names carry the item name", cards.every((c) => c.sws.every((s) => s.label.includes(c.name.slice(0, 8)))), cards[0]?.sws.map((s) => s.label));
    const tap = await page.evaluate(`[...document.querySelectorAll('ul[aria-label="รายการเมนู"] label')].filter(l => l.getBoundingClientRect().height > 0).map(l => Math.round(l.getBoundingClientRect().height))`);
    check("B2-03 390 toggle tap targets >= 44px tall", (tap as number[]).every((x) => x >= 44), [...new Set(tap as number[])]);
    console.log(`   card heights ${[...new Set(cards.map((c) => c.h))].join(",")}`);
    const tableTop = await page.locator('ul[aria-label="รายการเมนู"]').evaluate((e) => e.getBoundingClientRect().top + scrollY);
    await page.evaluate(`window.scrollTo(0, ${tableTop - 120})`);
    await page.waitForTimeout(400);
    await shot(page, "menu-390");
    // toggle sold-out from the card on the phone, then revert
    const card = page.locator('ul[aria-label="รายการเมนู"] > li').filter({ hasText: SOLD_OUT_ITEM }).first();
    const sold = card.getByRole("switch", { name: /หมดชั่วคราว/ });
    const before = await sold.getAttribute("aria-checked");
    await sold.click();
    await page.waitForFunction(([b]) => {
      const li = [...document.querySelectorAll('ul[aria-label="รายการเมนู"] > li')].find((l) => l.textContent?.includes(b!));
      const s = li?.querySelector('[role=switch][aria-label^="หมดชั่วคราว"]');
      return s?.getAttribute("aria-checked") === "true" || s?.getAttribute("aria-checked") === "false";
    }, [SOLD_OUT_ITEM]);
    await page.waitForTimeout(2500);
    const mid = await sold.getAttribute("aria-checked");
    await sold.click();
    await page.waitForTimeout(2500);
    const end = await sold.getAttribute("aria-checked");
    check("B2-03 390 sold-out toggle works from the card (and back)", mid !== before && end === before, { before, mid, end });
    await ctx.close();
  }
  for (const w of [768, 1024, 1280, 1440]) {
    const { ctx, page } = await newPage(browser, state, w, 900);
    await stableGoto(page, `${BASE}/menu`);
    const tables = (await page.evaluate(TABLES)) as Tbl[];
    const cardsVisible = await page.evaluate(`[...document.querySelectorAll('ul[aria-label="รายการเมนู"]')].filter(e => e.getBoundingClientRect().height > 0).length`);
    const rowSw = await page.evaluate(`(() => { const r = document.querySelector('main table tbody tr'); if (!r) return null; return [...r.querySelectorAll('[role=switch]')].map(s => Math.round(s.getBoundingClientRect().right)); })()`);
    check(`B2-03 ${w} table shown, fits its container, switches visible`, tables.length === 1 && tableFits(tables[0]!) && cardsVisible === 0 && Array.isArray(rowSw) && (rowSw as number[]).length === 3 && (rowSw as number[]).every((x) => x <= w), { tables, cardsVisible, rowSw });
    if (w === 1440 || w === 1024) await shot(page, `menu-${w}`);
    await ctx.close();
  }
}

/** /restaurant/tables (sweep row TABLES-390): phones get cards with the row actions in view; the table (from md) never scrolls sideways. */
async function tablesPage(browser: Browser, state: State) {
  for (const w of [390, 640, 768, 1024, 1280, 1440]) {
    const { ctx, page } = await newPage(browser, state, w, 900);
    await stableGoto(page, `${BASE}/tables`);
    const tables = (await page.evaluate(TABLES)) as Tbl[];
    const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
    const cards = (await page.evaluate(`[...document.querySelectorAll('ul[aria-label="รายการโต๊ะ"] > li')].filter(li => li.getBoundingClientRect().height > 0).map(li => { const r = li.getBoundingClientRect(); const btns = [...li.querySelectorAll('button,a[href]')].map(b => { const br = b.getBoundingClientRect(); return [Math.round(br.left), Math.round(br.right), Math.round(br.height)]; }); return { r: Math.round(r.right), btns }; })`)) as { r: number; btns: number[][] }[];
    if (w < 768) {
      const bad = cards.filter((c) => c.r > w || c.btns.some((b) => b[0]! < 0 || b[1]! > w));
      check(`TABLES ${w} card list, every action button inside the viewport, no page overflow`, tables.length === 0 && cards.length > 0 && bad.length === 0 && sw <= w, { tables, cards: cards.length, bad: bad.slice(0, 2), sw });
      const small = [...new Set(cards.flatMap((c) => c.btns.map((b) => b[2]!)))];
      check(`TABLES ${w} action buttons >= 40px tall`, small.every((x) => x >= 40), small);
    } else check(`TABLES ${w} table fits its container, no page overflow`, tables.length === 1 && tableFits(tables[0]!) && cards.length === 0 && sw <= w, { tables, cards: cards.length, sw });
    const top = await page.evaluate(`(() => { const e = [...document.querySelectorAll('ul[aria-label="รายการโต๊ะ"], main table')].find(x => x.getBoundingClientRect().height > 0); return e ? e.getBoundingClientRect().top + scrollY : 0; })()`);
    await page.evaluate(`window.scrollTo(0, ${Math.max(0, (top as number) - 100)})`);
    await page.waitForTimeout(300);
    if ([390, 768, 1024, 1440].includes(w)) await shot(page, `tables-${w}`);
    await ctx.close();
  }
}

/** /restaurant/orders?tab=history (sweep row HISTORY-390): the order table never scrolls sideways, whatever the guest names are. */
async function historyPage(browser: Browser, state: State) {
  for (const w of [390, 768, 1024, 1280, 1440]) {
    const { ctx, page } = await newPage(browser, state, w, 900);
    await stableGoto(page, `${BASE}/orders?tab=history`);
    const tables = (await page.evaluate(TABLES)) as Tbl[];
    const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
    const lastCol = (await page.evaluate(`[...document.querySelectorAll('main table tbody tr')].map(r => Math.round(r.lastElementChild.getBoundingClientRect().right))`)) as number[];
    check(`HISTORY ${w} table fits its container, totals column in view`, tables.length === 1 && tableFits(tables[0]!) && sw <= w && lastCol.every((x) => x <= w), { tables, sw, maxRight: Math.max(...lastCol) });
    if (w === 390 || w === 1280) await shot(page, `history-${w}`);
    await ctx.close();
  }
}

const PAGES = ["/menu", "/menu/modifiers", "/menu/items/new", "/tables", "/tables/print", "/reservations", "/orders", "/orders?tab=history", "/kitchen"];
const OPEN = /เพิ่ม|สร้าง|ใหม่|แก้ไข|จัดการ|ชุดเมนู|ปิดโต๊ะ|ดูสลิป/;
const NO = /ลบ|ยกเลิก|บันทึก|ยืนยัน|ส่ง|ค้นหา|สร้าง QR ใหม่/;

async function sweep(browser: Browser, state: State) {
  // first menu item detail page too
  {
    const { ctx, page } = await newPage(browser, state, 1440, 900);
    await stableGoto(page, `${BASE}/menu`);
    const href = await page.locator('main a[href*="/restaurant/menu/items/"]:not([href*="/items/new"])').first().getAttribute("href").catch(() => null);
    if (href) PAGES.splice(3, 0, href.replace(`/t/${SLUG}/restaurant`, ""));
    await ctx.close();
  }
  for (const [w, h] of [[390, 844], [390, 667]] as const) {
    const { ctx, page } = await newPage(browser, state, w, h);
    for (const p of PAGES) {
      const url = BASE + p;
      let res = await stableGoto(page, url);
      for (let i = 0; i < 2 && (res?.status() ?? 0) >= 500; i++) {
        console.log(`   ${p} ${res?.status()} ${(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`);
        await page.waitForTimeout(8000);
        res = await stableGoto(page, url);
      }
      if (h === 844) {
        const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
        const tables = (await page.evaluate(TABLES)) as Tbl[];
        check(`sweep ${w} ${p} (${res?.status()}) no page overflow, every table fits`, sw <= w && tables.every(tableFits), { sw, tables });
        if (tables.length) await shot(page, `sweep${p.replace(/[/?=]/g, "_")}-${w}`);
        continue;
      }
      // dialogs at 390x667 (smallest common phone)
      const cands = (await page.evaluate(`[...document.querySelectorAll('main button')].filter(b => b.offsetParent && b.type !== 'submit' && !b.disabled).map(b => (b.innerText || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 40))`)) as string[];
      const seen = new Set<string>();
      for (const t of cands) {
        const key = t.replace(/\s.*$/, "");
        if (!OPEN.test(t) || NO.test(t) || seen.has(key) || seen.size >= 5) continue;
        seen.add(key);
        if (page.url() !== url) await stableGoto(page, url);
        const btn = page.locator("main button").filter({ hasText: t.slice(0, 20) }).first();
        const target = (await btn.count()) ? btn : page.locator(`main button[aria-label="${t}"]`).first();
        if (!(await target.count())) continue;
        await target.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(800);
        const d = (await page.evaluate(DIALOG)) as Dlg | null;
        if (!d) {
          if (page.url() !== url) await stableGoto(page, url);
          else await page.keyboard.press("Escape");
          continue;
        }
        const measure = async (label: string, dd: Dlg) => {
          const reach = (await page.evaluate(LAST_REACHABLE)) as boolean;
          const ok = (inView(dd.rect, h, w) || dd.scrollable) && inView(dd.titleRect, h, w) && reach && dd.wide === 0;
          check(`sweep 390x667 ${p} '${label}' dialog fits / scrolls, title visible, last button reachable`, ok, { rect: dd.rect, title: dd.titleRect, last: dd.last, reach, scrollable: dd.scrollable, wide: dd.wide });
          if (!ok) await shot(page, `dlg${p.replace(/[/?=]/g, "_")}-${label.replace(/[^\w฀-๿]+/g, "_").slice(0, 20)}`);
        };
        await measure(t, d);
        // expand the inline add forms of the manager dialogs (the tallest state)
        for (const inner of ["เพิ่มหมวด", "เพิ่มชุดเมนู"]) {
          const ib = page.getByRole("dialog").getByRole("button", { name: inner });
          if (await ib.count()) {
            await ib.click();
            await page.waitForTimeout(500);
            const d2 = (await page.evaluate(DIALOG)) as Dlg;
            await measure(`${t} → ${inner}`, d2);
            await shot(page, `dlg${p.replace(/[/?=]/g, "_")}-${inner}`);
          }
        }
        if (/เพิ่มการจอง|เพิ่มโต๊ะ|เพิ่มกลุ่ม/.test(t)) await shot(page, `dlg${p.replace(/[/?=]/g, "_")}-${t.replace(/[^\w฀-๿]+/g, "_").slice(0, 20)}-390x667`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        const back = (await page.evaluate("(() => { const e = document.activeElement; return !e || e === document.body ? 'body' : (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); })()")) as string;
        check(`RESPONSIVE_B2-11 390x667 ${p} '${t}' Esc returns focus to the opener`, back !== "body" && back.slice(0, 12) === t.slice(0, 12), back);
        if (await page.locator("[role=dialog]:visible, [role=alertdialog]:visible").count()) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
        }
      }
    }
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const state = await login(browser);
  if (only.includes("dlg")) await dialogReservation(browser, state);
  if (only.includes("menu")) await menuList(browser, state);
  if (only.includes("tables")) await tablesPage(browser, state);
  if (only.includes("history")) await historyPage(browser, state);
  if (only.includes("sweep")) await sweep(browser, state);
  await browser.close();
  console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
