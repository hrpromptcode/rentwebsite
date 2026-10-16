import "../../load-env";
import path from "node:path";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { HERE, SHOTS, TENANTS, origin, newCtx, gotoRetry, watchConsole } from "./responsive_b2-lib";

/**
 * responsive_b2 keyboard sweep.
 *   nav   – 390: Tab order from page start, mobile-nav sheet: focus moves in, Tab/Shift+Tab trap, Esc, focus return; 1440: dropdown nav
 *   focus – Tab through the first 45 stops of key pages (390 + 1440): visible focus indicator, focus on invisible element, focus obscured by fixed UI
 *   rest  – restaurant /order: item card -> modifier sheet, add, cart bar -> cart sheet (trap / Esc / focus return)
 *   book  – salon /book wizard by keyboard only (focus after each step)
 *   shop  – shop product page by keyboard (variant, qty, add to cart), cart, checkout form submit with errors
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-kbd.ts nav focus rest book shop
 */
const parts = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SETTLE = Number(process.argv.find((a) => a.startsWith("--settle="))?.slice(9) ?? 120);
const FOCUS_PAGES = process.argv.find((a) => a.startsWith("--pages="))?.slice(8).split(",").map((x) => x.split(":") as [string, string]);
const want = (p: string) => !parts.length || parts.includes(p);
const log = (...a: unknown[]) => console.log(...a);

const DESCR = `(() => { const el = document.activeElement; if (!el || el === document.body) return { tag: "body" };
  const r = el.getBoundingClientRect(); const dlg = el.closest("[role=dialog],[role=alertdialog]");
  return { tag: el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.innerText || el.value || "").replace(/\\s+/g, " ").trim().slice(0, 40), href: el.getAttribute("href"), inDialog: !!dlg, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], cls: (typeof el.className === "string" ? el.className : "").slice(0, 90) }; })()`;

async function active(page: Page) {
  return (await page.evaluate(DESCR)) as { tag: string; label?: string; href?: string | null; inDialog?: boolean; rect?: number[]; cls?: string };
}

const SNAP = `(el) => { const f = (e) => { if (!e) return ""; const cs = getComputedStyle(e); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.textDecorationLine, cs.borderTopColor, cs.borderBottomColor, cs.borderBottomWidth, cs.opacity, cs.transform].join("|"); };
  return [f(el), f(el.parentElement), f(el.firstElementChild), el.firstElementChild ? f(el.firstElementChild.firstElementChild) : ""].join("#"); }`;

/** Tab through `n` stops; report stops with no visible focus change, invisible focus targets and focus hidden under fixed UI. */
async function focusSweep(page: Page, label: string, n = 45) {
  await page.evaluate("window.scrollTo(0,0); document.activeElement && document.activeElement.blur && document.activeElement.blur()");
  const problems: string[] = [];
  const seen = new Set<unknown>();
  let stops = 0;
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(SETTLE);
    const res = (await page.evaluate(`(async () => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const snap = (${SNAP});
      const focused = snap(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const d = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || "").replace(/\\s+/g, " ").trim().slice(0, 35);
      const id = el.tagName.toLowerCase() + " '" + d + "'" + (el.getAttribute("href") ? " -> " + el.getAttribute("href") : "");
      const tiny = r.width < 4 || r.height < 4;
      const off = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      let hiddenAnc = false; for (let a = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.opacity === "0" || s.visibility === "hidden") { hiddenAnc = true; break; } }
      // obscured: centre point covered by a fixed/sticky element that does not contain the focused element
      let obscured = "";
      if (!off && !tiny) { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, cx)), Math.min(innerHeight - 1, Math.max(0, cy)));
        if (top && !el.contains(top) && !top.contains(el)) { for (let a = top; a; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === "fixed" || p === "sticky") { obscured = a.tagName.toLowerCase() + "." + (typeof a.className === "string" ? a.className.split(" ").slice(0, 3).join(".") : ""); break; } } } }
      el.blur();
      await new Promise((r) => setTimeout(r, 400));
      const plain = snap(el);
      el.focus();
      const fv = el.matches(":focus-visible");
      return { id, same: focused === plain, tiny, off, hiddenAnc, obscured, fv, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], cls: (typeof el.className === "string" ? el.className : "").slice(0, 80), sr: cs.position === "absolute" && (cs.clip || "").startsWith("rect(0") };
    })()`)) as null | { id: string; same: boolean; tiny: boolean; off: boolean; hiddenAnc: boolean; obscured: string; fv: boolean; rect: number[]; cls: string; sr: boolean };
    if (!res) continue;
    if (seen.has(res.id + res.rect.join())) break; // wrapped around
    seen.add(res.id + res.rect.join());
    stops++;
    if (res.same && !res.tiny) problems.push(`NOFOCUS ${res.id} [${res.rect}] .${res.cls}`);
    if (res.tiny || res.sr) problems.push(`INVISIBLE-TARGET ${res.id} [${res.rect}] .${res.cls}`);
    if (res.hiddenAnc) problems.push(`HIDDEN-ANCESTOR ${res.id} [${res.rect}]`);
    if (res.obscured) problems.push(`OBSCURED ${res.id} [${res.rect}] by ${res.obscured}`);
  }
  log(`  [focus ${label}] stops=${stops} problems=${problems.length}`);
  for (const p of [...new Set(problems)].slice(0, 25)) log("    " + p);
  return problems;
}

/** Open a dialog from `trigger` with the keyboard and test trap / Esc / focus return. */
async function dialogTest(page: Page, trigger: Locator, label: string, key = "Enter") {
  await trigger.focus();
  const before = await active(page);
  await page.keyboard.press(key);
  await page.waitForTimeout(900);
  const dlgCount = await page.locator("[role=dialog]:visible, [role=alertdialog]:visible").count();
  const first = await active(page);
  let leftF = 0, leftB = 0;
  const stops: string[] = [];
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press("Tab");
    const a = await active(page);
    if (!a.inDialog) leftF++;
    if (stops.length < 30 && !stops.includes(a.label ?? a.tag)) stops.push(a.label || a.tag);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    if (!(await active(page)).inDialog) leftB++;
  }
  const bg = await page.evaluate(`(() => { const m = document.querySelector("main"); return { mainAriaHidden: m && m.closest("[aria-hidden=true]") ? true : false, mainInert: m && m.closest("[inert]") ? true : false, bodyOverflow: getComputedStyle(document.body).overflow, dialogH: (() => { const d = document.querySelector("[role=dialog]"); if (!d) return null; const r = d.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), innerHeight, d.scrollHeight, getComputedStyle(d).overflowY]; })() }; })()`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const after = await active(page);
  const dlgAfter = await page.locator("[role=dialog]:visible, [role=alertdialog]:visible").count();
  const returned = after.tag !== "body" && after.label === before.label && after.tag === before.tag;
  log(`  [dialog ${label}] trigger=${before.tag} '${before.label}' open=${dlgCount} firstFocus=${first.tag} '${first.label}' inDialog=${first.inDialog} | Tab x22 left=${leftF} ShiftTab x12 left=${leftB} | stops: ${stops.join(" · ").slice(0, 300)}`);
  log(`     bg=${JSON.stringify(bg)} | after Esc open=${dlgAfter} focus=${after.tag} '${after.label}' returned=${returned}`);
  return { open: dlgCount, firstIn: first.inDialog, leftF, leftB, closed: dlgAfter === 0, returned, after };
}

async function navTests(browser: Browser) {
  for (const slug of TENANTS) {
    log(`\n=== nav ${slug}`);
    const ctx = await newCtx(browser, 390, "no-preference");
    const page = await ctx.newPage();
    const logs = watchConsole(page);
    await gotoRetry(page, origin(slug) + "/");
    await page.waitForTimeout(1500);
    const order: string[] = [];
    let menuAt = -1;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const a = await active(page);
      order.push(`${a.tag}${a.label ? " '" + a.label + "'" : ""}`);
      if (a.label === "เปิดเมนู") {
        menuAt = i + 1;
        break;
      }
    }
    log(`  [390] first stops: ${order.slice(0, 6).join(" | ")} ; menu button after ${menuAt} Tab(s)`);
    const trig = page.locator('header button[aria-label="เปิดเมนู"]').first();
    if (await trig.count()) {
      await dialogTest(page, trig, "mobile-nav Enter");
      await dialogTest(page, trig, "mobile-nav Space", " ");
      // follow a link inside the sheet with the keyboard: sheet must close and the page navigate
      await trig.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      const link = page.locator("[role=dialog] nav a[href]").first();
      const href = await link.getAttribute("href");
      await link.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3500);
      log(`  [390] Enter on sheet link ${href}: url=${new URL(page.url()).pathname} dialogsOpen=${await page.locator("[role=dialog]:visible").count()} focus=${JSON.stringify(await active(page))}`);
      // expandable groups inside the sheet
      await gotoRetry(page, origin(slug) + "/");
      await trig.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      const groups = page.locator("[role=dialog] nav button[aria-expanded]");
      if (await groups.count()) {
        await groups.first().focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
        log(`  [390] sheet group expand via Enter: aria-expanded=${await groups.first().getAttribute("aria-expanded")} childLinks=${await page.locator("[role=dialog] nav div.border-l a").count()}`);
      }
      await page.keyboard.press("Escape");
    } else log("  [390] NO menu trigger in header");
    if (logs.length) log("  console: " + [...new Set(logs)].slice(0, 4).join(" || "));
    await ctx.close();
    // desktop: dropdown parents reachable by keyboard
    const dctx = await newCtx(browser, 1440, "no-preference");
    const dp = await dctx.newPage();
    await gotoRetry(dp, origin(slug) + "/");
    await dp.waitForTimeout(1000);
    const dd = (await dp.evaluate(`(() => [...document.querySelectorAll("header nav li, header nav > div")].filter(li => li.querySelector("a,button") && li.querySelectorAll("a").length > 1).map(li => ({ parent: (li.querySelector("a,button").innerText||"").trim(), kids: [...li.querySelectorAll("a")].slice(1).map(a => a.getAttribute("href")) })))()`)) as { parent: string; kids: string[] }[];
    for (const g of dd.slice(0, 3)) {
      const p = dp.locator("header nav").getByText(g.parent, { exact: true }).first();
      await p.focus().catch(() => {});
      await dp.keyboard.press("Tab");
      const a = await active(dp);
      const kidVisible = await dp.evaluate((h) => { const el = document.querySelector(`header a[href="${h}"]`); if (!el) return "missing"; const r = el.getBoundingClientRect(); let v = true; for (let n: Element | null = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") v = false; } return `${v ? "visible" : "HIDDEN"} ${Math.round(r.width)}x${Math.round(r.height)}`; }, g.kids[0]!);
      log(`  [1440] dropdown '${g.parent}' kids=${g.kids.length}: Tab after parent -> ${a.tag} '${a.label}' ${a.href ?? ""}; first child ${g.kids[0]} ${kidVisible}`);
    }
    await dctx.close();
  }
}

async function focusTests(browser: Browser) {
  const pages: [string, string][] = [
    ["demo-shop", "/"], ["demo-shop", "/products"], ["demo-shop", "/products/sofa-throw"], ["demo-shop", "/cart"], ["demo-shop", "/checkout"], ["demo-shop", "/account/login"],
    ["demo-cafe", "/"], ["demo-salon", "/"], ["demo-salon", "/book"], ["demo-clinic", "/"], ["demo-clinic", "/packages"],
    ["demo-restaurant", "/"], ["demo-restaurant", "/order"], ["demo-restaurant", "/reserve"], ["demo-corporate", "/"], ["demo-corporate", "/contact"],
  ];
  const list = FOCUS_PAGES ?? pages;
  for (const width of [390, 1440]) {
    const states = new Map<string, string>();
    for (const [slug, route] of list) {
      const st = path.join(HERE, `responsive_b2-state-${slug}.json`);
      if (!states.has(slug)) states.set(slug, st);
      const ctx = await newCtx(browser, width, "no-preference", route === "/account/login" ? undefined : await import("node:fs").then((f) => (f.existsSync(st) ? st : undefined)));
      const page = await ctx.newPage();
      await gotoRetry(page, origin(slug) + route);
      await page.waitForTimeout(2000);
      await focusSweep(page, `${slug}${route} @${width}`);
      await ctx.close();
    }
  }
}

async function restTests(browser: Browser) {
  log("\n=== restaurant /order keyboard");
  const ctx = await newCtx(browser, 390, "no-preference");
  const page = await ctx.newPage();
  const logs = watchConsole(page);
  await gotoRetry(page, origin("demo-restaurant") + "/order");
  await page.waitForTimeout(1500);
  // reach the first available item card with Tab only
  let reached: Awaited<ReturnType<typeof active>> | null = null;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const a = await active(page);
    if (a.cls?.includes("") && (await page.evaluate("!!document.activeElement.closest('[data-item-id]') || document.activeElement.hasAttribute('data-item-id')"))) {
      reached = a;
      log(`  item card reached after ${i + 1} Tabs: ${a.tag} '${a.label}' [${a.rect}]`);
      break;
    }
  }
  if (!reached) log("  item card NOT reachable by Tab in 60 presses");
  const card = page.locator("[data-item-id]:not([disabled])").first();
  const r1 = await dialogTest(page, card, "modifier sheet");
  // open again and add with keyboard: Tab to the add button
  await card.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  // pick required single choices with keyboard: focus each radio-like button in required groups
  const addBtn = page.locator("[role=dialog] button").filter({ hasText: /เพิ่ม|ใส่ตะกร้า|สั่ง/ }).last();
  let tabsToAdd = -1;
  for (let i = 0; i < 40; i++) {
    const isAdd = await addBtn.evaluate((b) => b === document.activeElement).catch(() => false);
    if (isAdd) { tabsToAdd = i; break; }
    await page.keyboard.press("Tab");
  }
  log(`  add button reached after ${tabsToAdd} Tabs; enabled=${await addBtn.isEnabled().catch(() => "?")} text='${(await addBtn.textContent().catch(() => ""))?.trim()}'`);
  const dlgBox = await page.locator("[role=dialog]").first().boundingBox();
  log(`  modifier sheet box ${JSON.stringify(dlgBox)} viewport 390x844`);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-rest-modifier-390.png") });
  if (await addBtn.isEnabled().catch(() => false)) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const a = await active(page);
    log(`  after add: dialogs=${await page.locator("[role=dialog]:visible").count()} focus=${a.tag} '${a.label}'`);
  } else {
    // choose first option of every group by clicking, then add
    const opts = page.locator("[role=dialog] [aria-pressed], [role=dialog] [role=radio], [role=dialog] [role=checkbox]");
    log(`  option controls: ${await opts.count()}`);
    await page.keyboard.press("Escape");
  }
  const bar = page.locator("[data-rw-cartbar] button").first();
  if (await bar.count()) {
    const r2 = await dialogTest(page, bar, "cart sheet");
    await bar.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-rest-cartsheet-390.png") });
    const qty = await page.locator("[role=dialog] button[aria-label]").evaluateAll((bs) => bs.map((b) => `${b.getAttribute("aria-label")} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
    log(`  cart sheet labelled buttons: ${qty.join(" | ")}`);
    await page.keyboard.press("Escape");
    void r2;
  } else log("  no cart bar after add");
  void r1;
  if (logs.length) log("  console: " + [...new Set(logs)].slice(0, 4).join(" || "));
  await ctx.close();
}

async function bookTests(browser: Browser) {
  for (const slug of ["demo-salon", "demo-clinic"]) {
    log(`\n=== ${slug} /book keyboard`);
    const ctx = await newCtx(browser, 390, "no-preference", path.join(HERE, `responsive_b2-state-${slug}.json`));
    const page = await ctx.newPage();
    const logs = watchConsole(page);
    await gotoRetry(page, origin(slug) + "/book");
    await page.waitForTimeout(1500);
    // Tab until a service option inside main
    for (let step = 0; step < 6; step++) {
      const heading = (await page.locator("main h2, main h1").allInnerTexts()).slice(0, 3).join(" / ");
      let found = false;
      for (let i = 0; i < 50; i++) {
        await page.keyboard.press("Tab");
        const ok = await page.evaluate(`(() => { const el = document.activeElement; if (!el || !el.closest("main")) return false; const t = (el.innerText || el.getAttribute("aria-label") || ""); return el.tagName === "BUTTON" && !el.disabled && !/ย้อนกลับ|กลับ|เดือนก่อน|ก่อนหน้า|เปลี่ยน|แก้ไข/.test(t) && !el.closest("nav") && !el.matches("[data-step-done], [aria-current]") && t.trim().length > 0; })()`);
        if (ok) { found = true; break; }
      }
      const a = await active(page);
      log(`  step ${step} (${heading.slice(0, 80)}): Tab -> ${found ? `${a.tag} '${a.label}' [${a.rect}]` : "no enabled option in 50 Tabs"}`);
      if (!found) break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1800);
      const after = await active(page);
      log(`    after Enter: focus=${after.tag} '${after.label}' url=${new URL(page.url()).pathname}${new URL(page.url()).search.slice(0, 60)}`);
      if (await page.locator("form input[name], main input[type=text], main input[type=tel]").count()) {
        log("    reached details form");
        break;
      }
    }
    await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-book-kbd-${slug}-390.png`) });
    if (logs.length) log("  console: " + [...new Set(logs)].slice(0, 4).join(" || "));
    await ctx.close();
  }
}

async function shopTests(browser: Browser) {
  log("\n=== demo-shop product + checkout keyboard");
  const ctx = await newCtx(browser, 390, "no-preference");
  const page = await ctx.newPage();
  const logs = watchConsole(page);
  await gotoRetry(page, origin("demo-shop") + "/products/sofa-throw");
  await page.waitForTimeout(1500);
  const add = page.getByRole("button", { name: /ใส่ตะกร้า|เพิ่มลงตะกร้า|เพิ่มในตะกร้า/ }).first();
  let n = -1;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if (await add.evaluate((b) => b === document.activeElement).catch(() => false)) { n = i + 1; break; }
  }
  log(`  add-to-cart reached after ${n} Tabs`);
  if (n > 0) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    const a = await active(page);
    log(`  after Enter: focus=${a.tag} '${a.label}' dialogs=${await page.locator("[role=dialog]:visible").count()} toast=${(await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ").slice(0, 120)}`);
  }
  await gotoRetry(page, origin("demo-shop") + "/checkout");
  await page.waitForTimeout(1500);
  const submit = page.locator("main form button[type=submit]").last();
  log(`  checkout submit: '${(await submit.textContent().catch(() => ""))?.trim()}'`);
  if (await submit.count()) {
    await submit.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    const a = await active(page);
    const inv = await page.evaluate(`[...document.querySelectorAll("[aria-invalid=true]")].map(e => (e.id||e.name) + (e.getAttribute("aria-describedby") ? " desc=" + e.getAttribute("aria-describedby") : " NO-DESC"))`);
    const vmsg = await page.evaluate(`(() => { const e = document.activeElement; return e && e.validationMessage ? e.validationMessage : ""; })()`);
    log(`  after submitting empty form: focus=${a.tag} '${a.label}' [${a.rect}] validationMessage='${vmsg}' invalid=${JSON.stringify(inv)}`);
  }
  if (logs.length) log("  console: " + [...new Set(logs)].slice(0, 4).join(" || "));
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  if (want("nav")) await navTests(browser);
  if (want("rest")) await restTests(browser);
  if (want("book")) await bookTests(browser);
  if (want("shop")) await shopTests(browser);
  if (want("focus")) await focusTests(browser);
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
