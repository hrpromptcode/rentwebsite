import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: find what widens /settings/team at 390 (admin). */
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3001/login", { waitUntil: "networkidle" });
  await p.fill("#email", "admin@rentweb.local"); await p.fill("#password", "Admin1234!");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click('button[type="submit"]')]);
  const st = await ctx.storageState(); await ctx.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: st, isMobile: true });
  const page = await m.newPage();
  await page.goto("http://localhost:3001/t/demo-shop/settings/team", { waitUntil: "networkidle" });
  const r = await page.evaluate(`(() => { const out = []; const walk = (el, d) => { for (const c of el.children) walk(c, d + 1); }; document.querySelectorAll('main *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > 391 && ![...el.children].some(c => c.getBoundingClientRect().right > 391)) { const cs = getComputedStyle(el); out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0,6).join('.') + ' w=' + Math.round(r.width) + ' R=' + Math.round(r.right) + ' ws=' + cs.whiteSpace + ' minW=' + cs.minWidth + ' "' + (el.textContent||'').trim().slice(0,40) + '"'); } }); return out.slice(0, 12); })()`);
  console.log(r.join("\n"));
  const anc = await page.evaluate(`(() => { const card = document.querySelector('main .card'); const out = []; for (let n = card; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); out.push(n.tagName.toLowerCase() + '.' + String(n.className).split(' ').slice(0,5).join('.') + ' w=' + Math.round(n.getBoundingClientRect().width) + ' display=' + cs.display + ' cols=' + cs.gridTemplateColumns); } return out; })()`);
  console.log("ancestors:\n" + anc.join("\n"));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
