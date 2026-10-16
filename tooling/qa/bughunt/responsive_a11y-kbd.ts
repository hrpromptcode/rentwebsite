import "../../load-env";
import { chromium, type Page } from "@playwright/test";

/** responsive_a11y bughunt: keyboard checks (focus visible, mobile nav dialog trap/Esc/restore, desktop nav reachability). */
const ALL = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tenants = slugs.length ? slugs : ALL;
const log = (...a: unknown[]) => console.log(...a);

const ACTIVE = `(() => { const a = document.activeElement; if (!a || a === document.body) return null; const d = a.closest('[role=dialog]'); return { tag: a.tagName.toLowerCase(), label: (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40), href: a.getAttribute('href'), inDialog: !!d }; })()`;
const STYLE = `(el) => { const cs = getComputedStyle(el); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.textDecorationLine, cs.borderColor, cs.opacity].join('|'); }`;

async function focusAudit(page: Page, label: string, max = 45) {
  await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await page.mouse.click(1, 300).catch(() => {});
  const order: { idx: number; desc: string; focused: string }[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const r = (await page.evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return null; if (!a.dataset.kbd) a.dataset.kbd = String(${i}); const s = (${STYLE})(a); const rect = a.getBoundingClientRect(); return { idx: a.dataset.kbd, desc: a.tagName.toLowerCase() + ' ' + (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g,' ').trim().slice(0,30) + (a.getAttribute('href') ? ' -> ' + a.getAttribute('href') : '') + ' [' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ' @' + Math.round(rect.top) + ']', s }; })()`)) as { idx: string; desc: string; s: string } | null;
    if (!r) break;
    if (order.some((o) => String(o.idx) === r.idx)) break; // wrapped
    order.push({ idx: Number(r.idx), desc: r.desc, focused: r.s });
  }
  await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await page.waitForTimeout(200);
  const none: string[] = [];
  for (const o of order) {
    const base = (await page.evaluate(`(() => { const el = document.querySelector('[data-kbd="${o.idx}"]'); return el ? (${STYLE})(el) : null; })()`)) as string | null;
    if (base !== null && base === o.focused) none.push(o.desc);
  }
  log(`  [${label}] tab stops=${order.length} first=${order[0]?.desc} | NO visible focus change on ${none.length}: ${none.slice(0, 12).join(" ;; ")}`);
  return order;
}

async function main() {
  const browser = await chromium.launch();
  for (const slug of tenants) {
    const base = `http://${slug}.localhost:3000`;
    log(`\n=== ${slug}`);
    // ---------- desktop
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(base + "/", { waitUntil: "networkidle", timeout: 90_000 });
      const order = await focusAudit(page, "1440 home");
      log(`  [1440] first 6 tab stops: ${order.slice(0, 6).map((o) => o.desc).join(" | ")}`);
      // desktop header nav items vs mobile nav items
      const desk = (await page.evaluate(`[...document.querySelectorAll('header nav a')].filter(a => a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility !== 'hidden').map(a => a.getAttribute('href'))`)) as string[];
      const menuBtnVisible = await page.locator('button[aria-label="เปิดเมนู"]').first().isVisible().catch(() => false);
      log(`  [1440] visible header nav links: ${desk.join(" ")} | mobile menu button visible=${menuBtnVisible}`);
      // dropdown children reachable with keyboard?
      const parents = (await page.evaluate(`[...document.querySelectorAll('header nav .group')].filter(g => g.querySelectorAll('a').length > 1).length`)) as number;
      if (parents) {
        const vis = (await page.evaluate(`(() => { const g = [...document.querySelectorAll('header nav .group')].find(g => g.querySelectorAll('a').length > 1); const a = g.querySelector('a'); a.focus(); const child = g.querySelectorAll('a')[1]; return { child: child.textContent.trim(), vis: getComputedStyle(child.closest('.invisible, .absolute') || child).visibility }; })()`)) as { child: string; vis: string };
        await page.waitForTimeout(300);
        const vis2 = (await page.evaluate(`(() => { const g = [...document.querySelectorAll('header nav .group')].find(g => g.querySelectorAll('a').length > 1); const child = g.querySelectorAll('a')[1]; const p = child.parentElement.parentElement; return getComputedStyle(p).visibility + '/' + getComputedStyle(p).opacity; })()`)) as string;
        log(`  [1440] dropdown parents=${parents}; after focusing parent link child '${vis.child}' visibility=${vis2}`);
      }
      await ctx.close();
    }
    // ---------- mobile
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(base + "/", { waitUntil: "networkidle", timeout: 90_000 });
      await focusAudit(page, "390 home", 25);
      // reach the menu button with Tab
      await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
      let reached = false;
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const a = (await page.evaluate(ACTIVE)) as { label: string } | null;
        if (a?.label === "เปิดเมนู") { reached = true; log(`  [390] menu button reached after ${i + 1} Tab(s)`); break; }
      }
      if (!reached) { log("  [390] menu button NOT reachable by Tab"); await ctx.close(); continue; }
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      const dlg = await page.locator('[role="dialog"]').count();
      const a1 = (await page.evaluate(ACTIVE)) as { inDialog: boolean; label: string } | null;
      log(`  [390] after Enter: dialogs=${dlg} focus=${JSON.stringify(a1)}`);
      let escaped = 0; const seen: string[] = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const a = (await page.evaluate(ACTIVE)) as { inDialog: boolean; label: string } | null;
        if (!a?.inDialog) escaped++;
        if (a && !seen.includes(a.label)) seen.push(a.label);
      }
      log(`  [390] 25 Tabs inside sheet: left dialog ${escaped} times; stops=${seen.join(" | ")}`);
      // shift-tab too
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+Tab");
      const a2 = (await page.evaluate(ACTIVE)) as { inDialog: boolean } | null;
      log(`  [390] after Shift+Tab x5 inDialog=${a2?.inDialog}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      const dlg2 = await page.locator('[role="dialog"]').count();
      const a3 = (await page.evaluate(ACTIVE)) as { label: string } | null;
      log(`  [390] after Esc: dialogs=${dlg2} focus=${JSON.stringify(a3)}`);
      // body scroll lock + page behind inert?
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const inert = (await page.evaluate(`(() => { const m = document.querySelector('main'); return { ariaHidden: m && m.closest('[aria-hidden=true]') ? true : false, inert: m && m.closest('[inert]') ? true : false, overflow: getComputedStyle(document.body).overflow, pointer: getComputedStyle(document.body).pointerEvents }; })()`)) as Record<string, unknown>;
      log(`  [390] sheet open: background ${JSON.stringify(inert)}`);
      // close via close button
      const close = page.locator('[role="dialog"] button').filter({ hasText: /close|ปิด/i });
      log(`  [390] sheet close buttons: ${await page.locator('[role="dialog"] button').evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()).join(" | "))} (matching close=${await close.count()})`);
      await page.keyboard.press("Escape");
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
