import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: tab order from a fresh load (no click), menu-button reachability, minimal-header nav coverage. */
const ALL = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
const ACTIVE = `(() => { const a = document.activeElement; if (!a || a === document.body) return null; return (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g,' ').trim().slice(0,30) + (a.getAttribute('href') ? '->' + a.getAttribute('href') : '') + (a.closest('header') ? ' [header]' : a.closest('main') ? ' [main]' : a.closest('footer') ? ' [footer]' : ''); })()`;
async function main() {
  const browser = await chromium.launch();
  for (const slug of ALL) {
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768 });
      const page = await ctx.newPage();
      await page.goto(`http://${slug}.localhost:3000/`, { waitUntil: "networkidle", timeout: 90_000 });
      const stops: string[] = [];
      for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); stops.push(String(await page.evaluate(ACTIVE))); }
      console.log(`${slug} ${width} first tabs: ${stops.join(" | ")}`);
      if (width === 390) {
        const items = await page.evaluate(`(async () => { const b = document.querySelector('button[aria-label="เปิดเมนู"]'); return b ? 'menu button present, visible=' + (b.getBoundingClientRect().width > 0) + ' inHeader=' + !!b.closest('header') : 'NO MENU BUTTON'; })()`);
        console.log(`   ${items}`);
        await page.locator('button[aria-label="เปิดเมนู"]').first().click().catch(() => {});
        await page.waitForTimeout(500);
        const nav = await page.evaluate(`[...document.querySelectorAll('[role=dialog] nav a, [role=dialog] nav button')].map(a => (a.textContent||'').trim() + (a.getAttribute('href') ? '->' + a.getAttribute('href') : ''))`);
        console.log(`   mobile nav items: ${JSON.stringify(nav)}`);
      } else {
        const desk = await page.evaluate(`[...document.querySelectorAll('header nav a')].filter(a => a.getBoundingClientRect().width > 0).map(a => (a.textContent||'').trim() + '->' + a.getAttribute('href'))`);
        console.log(`   desktop header nav: ${JSON.stringify(desk)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
