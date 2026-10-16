import "../../load-env";
import { chromium } from "@playwright/test";

/** Dark-mode toggle persistence + reduced-motion visibility (storefront_shop bughunt). */
const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const browser = await chromium.launch();
  // --- A. toggle on the throwaway tenant in "system" mode
  const O = "http://qa-sf-theme.localhost:3000";
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
    await page.goto(O + "/", { waitUntil: "networkidle", timeout: 90_000 });
    const cls = async () => page.evaluate("document.documentElement.className.split(' ').filter(c => c === 'dark' || c === 'light').join(',')");
    const bg = async () => page.evaluate("getComputedStyle(document.body).backgroundColor");
    const toggle = page.locator("header button[aria-label]").filter({ has: page.locator("svg") });
    const labels = await page.locator("header button[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    log(`[${scheme}] initial class=${await cls()} bg=${await bg()} header buttons=${JSON.stringify(labels)}`);
    const t = page.locator('header button[aria-label="โหมดมืด"], header button[aria-label="โหมดสว่าง"], header button[aria-label*="มืด"], header button[aria-label*="สว่าง"]').first();
    if (!(await t.count())) {
      log(`[${scheme}] no toggle found`);
      await ctx.close();
      continue;
    }
    await t.click();
    await page.waitForTimeout(300);
    log(`[${scheme}] after toggle class=${await cls()} bg=${await bg()} label=${await t.getAttribute("aria-label")} ls=${await page.evaluate("localStorage.getItem('rw-theme')")}`);
    await page.reload({ waitUntil: "networkidle" });
    log(`[${scheme}] after reload class=${await cls()} bg=${await bg()}`);
    await page.goto(O + "/about", { waitUntil: "networkidle" });
    log(`[${scheme}] other page class=${await cls()} bg=${await bg()}`);
    await page.goto(O + "/", { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots/bughunt-storefront_shop-theme-${scheme}-toggled.png` });
    // mobile: toggle visible in mobile header?
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    log(`[${scheme}] mobile toggle visible=${await t.isVisible()}`);
    log(`[${scheme}] errors`, errs);
    await ctx.close();
  }
  // --- B. reduced motion + no-scroll: is content visible on demo tenants?
  for (const slug of ["demo-shop", "demo-cafe", "demo-corporate"]) {
    for (const rm of ["reduce", "no-preference"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: rm });
      const page = await ctx.newPage();
      await page.goto(`http://${slug}.localhost:3000/`, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForTimeout(1500);
      // count headings/paragraphs below the fold that are invisible (opacity 0) without scrolling
      const res = await page.evaluate(`(() => {
        const els = [...document.querySelectorAll("main h1, main h2, main h3, main p, main img, main a")];
        let hidden = 0, total = 0; const samples = [];
        for (const el of els) {
          total++;
          let n = el, op = 1;
          while (n && n !== document.body) { const o = parseFloat(getComputedStyle(n).opacity); op = Math.min(op, o); n = n.parentElement; }
          if (op < 0.05) { hidden++; if (samples.length < 3) samples.push((el.textContent || el.getAttribute("src") || "").trim().slice(0, 40)); }
        }
        return { hidden, total, samples, h: document.body.scrollHeight };
      })()`);
      log(`[${slug}] reducedMotion=${rm} no-scroll: ${JSON.stringify(res)}`);
      if (rm === "reduce") {
        // scroll through and re-check
        await page.evaluate("(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } })()");
        await page.waitForTimeout(800);
        const res2 = await page.evaluate(`(() => {
          const els = [...document.querySelectorAll("main h1, main h2, main h3, main p, main img, main a")];
          let hidden = 0; const samples = [];
          for (const el of els) { let n = el, op = 1; while (n && n !== document.body) { op = Math.min(op, parseFloat(getComputedStyle(n).opacity)); n = n.parentElement; } if (op < 0.05) { hidden++; if (samples.length < 3) samples.push((el.textContent || "").trim().slice(0, 40)); } }
          return { hidden, samples };
        })()`);
        log(`[${slug}] reducedMotion=reduce after scroll: ${JSON.stringify(res2)}`);
        await page.screenshot({ path: `screenshots/bughunt-storefront_shop-rm-${slug}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
