import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: dropdown keyboard reachability (demo-shop) + salon footer links + tablet hover-only dropdown. */
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("http://demo-shop.localhost:3000/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const cur = await page.evaluate(`document.activeElement.textContent.trim()`);
  await page.waitForTimeout(500);
  const childVis = await page.evaluate(`(() => { const a = document.activeElement; const g = a.closest('.group'); const box = g.querySelector('.invisible'); const cs = getComputedStyle(box); return { cls: box.className.slice(0,60), vis: cs.visibility, op: cs.opacity, trans: cs.transitionProperty + ' ' + cs.transitionDuration }; })()`);
  await page.keyboard.press("Tab");
  const next = await page.evaluate(`document.activeElement.textContent.trim() + ' ' + document.activeElement.getAttribute('href')`);
  console.log("focused parent:", cur, "| dropdown box:", JSON.stringify(childVis), "| next Tab ->", next);
  // salon footer + header at 1440
  await page.goto("http://demo-salon.localhost:3000/", { waitUntil: "networkidle" });
  const foot = await page.evaluate(`[...document.querySelectorAll('footer a')].map(a => (a.textContent||'').trim() + '->' + a.getAttribute('href'))`);
  console.log("salon footer links:", JSON.stringify(foot));
  const hdr = await page.evaluate(`[...document.querySelectorAll('header a, header button')].filter(a => a.getBoundingClientRect().width > 0).map(a => (a.getAttribute('aria-label') || a.textContent||'').trim() + '->' + a.getAttribute('href'))`);
  console.log("salon header (1440):", JSON.stringify(hdr));
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(300);
  const hdr2 = await page.evaluate(`[...document.querySelectorAll('header a, header button')].filter(a => a.getBoundingClientRect().width > 0).map(a => (a.getAttribute('aria-label') || a.textContent||'').trim() + '->' + a.getAttribute('href'))`);
  console.log("salon header (768):", JSON.stringify(hdr2));
  await page.screenshot({ path: "screenshots/bughunt-responsive_a11y-salon-header-768.png", clip: { x: 0, y: 0, width: 768, height: 120 } });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
