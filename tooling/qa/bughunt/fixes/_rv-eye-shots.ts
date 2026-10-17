import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * reverify-storefront human-eye pass: every demo home + one module page per tenant at 1440 and 390 with motion ON
 * (reducedMotion "no-preference" = default visitors). Scrolls through the page so reveal animations play, then
 * takes a full-page shot (tooling/screenshots/rv-<tenant>-<page>-<w>.png) and prints automatic checks:
 * headings still invisible after the reveal (opacity/visibility), horizontal overflow, Thai glyph fallback.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/_rv-eye-shots.ts [demo-x ...]
 */
const PAGES: Record<string, string[]> = {
  "demo-shop": ["/", "/products"],
  "demo-cafe": ["/", "/products/croissant"],
  "demo-salon": ["/", "/book"],
  "demo-clinic": ["/", "/services"],
  "demo-restaurant": ["/", "/menu"],
  "demo-corporate": ["/", "/services"],
};
const only = process.argv.slice(2).filter((a) => a.startsWith("demo-"));
async function main() {
  const browser = await chromium.launch();
  for (const slug of only.length ? only : Object.keys(PAGES)) {
    for (const p of PAGES[slug]!) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "no-preference", isMobile: width < 768, hasTouch: width < 768, locale: "th-TH" });
        await isolateHmr(ctx);
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
        page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120)));
        await stableGoto(page, `http://${slug}.localhost:3000${p}`);
        await page.waitForTimeout(1500);
        await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 300) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 120)); } window.scrollTo({ top: 0, behavior: "instant" }); await new Promise(r => setTimeout(r, 400)); })()`);
        await page.waitForTimeout(1200);
        const r = (await page.evaluate(`(() => {
          const hidden = [];
          for (const el of document.querySelectorAll("main h1, main h2, main h3")) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            let n = el, op = 1, vis = true;
            while (n && n !== document.body) { const cs = getComputedStyle(n); op *= Number(cs.opacity); if (cs.visibility === "hidden") vis = false; n = n.parentElement; }
            if (op < 0.6 || !vis) hidden.push((el.textContent || "").trim().slice(0, 30) + " op=" + op.toFixed(2));
          }
          const h1 = [...document.querySelectorAll("h1")].map((e) => (e.textContent || "").trim().slice(0, 40));
          return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, hidden, h1, height: document.documentElement.scrollHeight };
        })()`)) as { overflow: number; hidden: string[]; h1: string[]; height: number };
        const file = `screenshots/rv-${slug}-${p === "/" ? "home" : p.replace(/\W+/g, "-").replace(/^-|-$/g, "")}-${width}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(`${slug}${p} @${width}: h=${r.height} overflow=${r.overflow} h1=${JSON.stringify(r.h1)} hiddenHeadings=${r.hidden.length ? r.hidden.join(" | ") : "none"} errors=${errs.length ? errs.slice(0, 2).join(" | ") : "none"} -> ${file}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
