import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HERE, SHOTS, isolateHmr, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: admin restaurant reservations 'เพิ่มการจอง' dialog at 390x844 (and 390x667): geometry, submit reachability, wheel/touch scroll. */
async function main() {
  const browser = await chromium.launch();
  for (const h of [844, 667]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: h }, storageState: path.join(HERE, "responsive_b2-admin-state.json"), isMobile: true, hasTouch: true });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await gotoRetry(page, "http://localhost:3001/t/demo-restaurant/restaurant/reservations");
    await page.waitForTimeout(1500);
    await page.locator("main button").filter({ hasText: "เพิ่มการจอง" }).first().click();
    await page.waitForTimeout(1500);
    const info = await page.evaluate(`(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); const sub = [...d.querySelectorAll('button[type=submit]')].map(b => { const br = b.getBoundingClientRect(); return (b.innerText||'').trim() + ' [' + Math.round(br.top) + ',' + Math.round(br.bottom) + ']'; }); const close = [...d.querySelectorAll('button')].filter(b => /ปิด/.test(b.innerText + (b.getAttribute('aria-label')||''))).map(b => Math.round(b.getBoundingClientRect().top)); return { rect: [Math.round(r.top), Math.round(r.bottom), Math.round(r.height)], cls: d.className.slice(0, 160), overflowY: cs.overflowY, maxH: cs.maxHeight, scrollH: d.scrollHeight, clientH: d.clientHeight, submit: sub, closeTop: close, title: (d.querySelector('h2')||{}).textContent }; })()`);
    console.log(`390x${h}`, JSON.stringify(info));
    await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-admin-resdlg-390x${h}.png`) });
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(600);
    const after = await page.evaluate(`(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); return { top: Math.round(r.top), dScroll: d.scrollTop, winScroll: scrollY }; })()`);
    console.log(`  after wheel`, JSON.stringify(after));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
