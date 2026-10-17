import "../../../load-env";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { HERE, SHOTS, isolateHmr, gotoRetry } from "../responsive_b2-lib";

/**
 * responsive_b2 admin dialogs at 390x844: on every module/settings page click the non-destructive opener buttons in <main>
 * (เพิ่ม / สร้าง / แก้ไข / จัดการ / เชิญ / อัปโหลด … or aria-haspopup=dialog) and measure the dialog/sheet that opens:
 * inside the viewport or internally scrollable, last (submit) button reachable, nothing wider than the viewport, Esc closes, focus returns.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-admin-dialogs.ts [slug ...]
 */
const base = "http://localhost:3001";
const OUT = path.join(HERE, "fixes", "_rab4-overflow.jsonl");
const STATE = path.join(HERE, "fixes", "_rab4-admin-state.json");
const PAGES: Record<string, string[]> = {
  "demo-shop": ["/pages", "/navigation", "/media", "/forms", "/customers", "/products", "/products/categories", "/discounts", "/shipping", "/reviews", "/orders", "/settings", "/settings/payments", "/settings/domains", "/settings/team", "/settings/danger"],
  "demo-restaurant": ["/restaurant/menu", "/restaurant/menu/modifiers", "/restaurant/tables", "/restaurant/reservations", "/restaurant/orders", "/restaurant/kitchen"],
  "demo-clinic": ["/clinic/patients", "/clinic/visits", "/clinic/packages", "/bookings", "/services", "/staff", "/customers"],
};
const OPEN = /เพิ่ม|สร้าง|ใหม่|แก้ไข|จัดการ|เชิญ|อัปโหลด|นำเข้า|ตั้งค่า|เลือก|กำหนด|วันหยุด|ลา|เปิดรอบ|ปรับ/;
const NO = /ลบ|ยกเลิก|ออกจากระบบ|บันทึก|ยืนยัน|ระงับ|ส่ง|ปิดบัญชี|โอน|ล้าง|รีเซ็ต|คืนเงิน|ถัดไป|ก่อนหน้า|ค้นหา/;
const log = (...a: unknown[]) => console.log(...a);

const MEASURE = `(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(e => e.getBoundingClientRect().height > 0).pop(); if (!d) return null; const r = d.getBoundingClientRect();
  let scroller = null; for (const el of [d, ...d.querySelectorAll('*')]) { const c = getComputedStyle(el); if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) { scroller = el; break; } }
  const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent && !/ปิด|close/i.test(b.getAttribute('aria-label') || '') );
  const last = btns[btns.length - 1]; const lr = last ? last.getBoundingClientRect() : null;
  const wide = []; d.querySelectorAll('*').forEach(el => { const er = el.getBoundingClientRect(); if (er.width > 1 && er.right > innerWidth + 1) { let clipped = false; for (let a = el.parentElement; a && a !== d; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; } } if (!clipped) wide.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 3).join('.') + ' R=' + Math.round(er.right)); } });
  return { title: (d.querySelector('h2,[data-slot=dialog-title],[data-slot=sheet-title]') || {}).textContent || '', top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width), scrollable: !!scroller, vh: innerHeight, vw: innerWidth, lastBtn: last ? (last.innerText || last.getAttribute('aria-label') || '').trim().slice(0, 20) + ' [' + Math.round(lr.top) + ',' + Math.round(lr.bottom) + ']' : null, wide: wide.slice(0, 4) }; })()`;

async function lastReachable(page: Page) {
  return page.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(e => e.getBoundingClientRect().height > 0).pop(); const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent); const last = btns[btns.length - 1]; if (!last) return true; last.scrollIntoView({ block: 'nearest' }); const r = last.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2)); return r.bottom <= innerHeight + 1 && r.top >= 0 && !!t && (last === t || last.contains(t)); })()`) as Promise<boolean>;
}

async function main() {
  const browser = await chromium.launch();
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
  for (const slug of slugs) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: STATE, isMobile: true, hasTouch: true });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    for (const p of PAGES[slug]!) {
      const url = `${base}/t/${slug}${p}`;
      await gotoRetry(page, url);
      await page.waitForTimeout(1200);
      const cands = (await page.evaluate(`[...document.querySelectorAll('main button')].filter(b => b.offsetParent && b.type !== 'submit' && !b.disabled).map((b, i) => ({ i, t: (b.innerText || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 40), pop: b.getAttribute('aria-haspopup') }))`)) as { i: number; t: string; pop: string | null }[];
      const picks = cands.filter((c) => (c.pop === "dialog" || OPEN.test(c.t)) && !NO.test(c.t));
      const seen = new Set<string>();
      for (const c of picks) {
        if (seen.has(c.t) || seen.size >= 6) continue;
        seen.add(c.t);
        if (page.url() !== url) { await gotoRetry(page, url); await page.waitForTimeout(800); }
        const btn = page.locator("main button").filter({ hasText: c.t.slice(0, 20) }).first();
        const target = (await btn.count()) ? btn : page.locator(`main button[aria-label="${c.t}"]`).first();
        if (!(await target.count())) continue;
        await target.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const d = (await page.evaluate(MEASURE)) as Record<string, any> | null;
        if (!d) {
          const nav = page.url() !== url;
          log(`  ${slug}${p} '${c.t}': no dialog${nav ? " (navigated -> " + new URL(page.url()).pathname + ")" : ""}`);
          if (!nav) await page.keyboard.press("Escape");
          continue;
        }
        let flag = "";
        if ((d.top < -1 || d.bottom > d.vh + 1) && !d.scrollable) flag = "DIALOG-CLIPPED";
        else if (d.w > d.vw + 1 || d.wide.length) flag = "DIALOG-WIDE";
        const reach = await lastReachable(page);
        if (!reach) flag = (flag ? flag + "+" : "") + "LAST-BUTTON-UNREACHABLE";
        await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
        const after = (await page.evaluate(`(() => { const e = document.activeElement; return { open: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(x => x.getBoundingClientRect().height > 0).length, focus: e === document.body ? 'body' : e.tagName.toLowerCase() + " '" + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 25) + "'" }; })()`)) as { open: number; focus: string };
        if (after.open) flag = (flag ? flag + "+" : "") + "ESC-DID-NOT-CLOSE";
        log(`  ${slug}${p} '${c.t}' -> ${JSON.stringify(d)} reach=${reach} afterEsc=${JSON.stringify(after)} ${flag}`);
        appendFileSync(OUT, JSON.stringify({ kind: "dialog2", slug, link: p, opener: c.t, d, reach, after, flag }) + "\n");
        if (flag) await page.screenshot({ path: path.join(SHOTS, `fix-rab4-hunter-dlg-${slug}${p.replace(/\//g, "_")}-${seen.size}.png`) });
        if (after.open) { await page.keyboard.press("Escape"); await gotoRetry(page, url); }
      }
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
