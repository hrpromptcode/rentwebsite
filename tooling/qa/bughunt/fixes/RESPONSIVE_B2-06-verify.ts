import "../../../load-env";
import { chromium } from "@playwright/test";
import { origin, newCtx, gotoRetry } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-06 verify: focus inside a not-yet-revealed Reveal / Stagger block reveals it.
 * Independent of scroll-padding (disabled here) and of scrolling: for every unrevealed block that contains a focusable
 * element, the page is scrolled so the block's top sits inside the excluded bottom band (vh - 40px), the first
 * focusable is focused with preventScroll, and 1.5 s later its effective opacity must be 1.
 * Run from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RESPONSIVE_B2-06-verify.ts
 */
const CASES: [string, string, number][] = [["demo-salon", "/", 1440], ["demo-shop", "/", 1440], ["demo-clinic", "/", 390], ["demo-corporate", "/", 1440]];
const FOCUSABLE = "a[href], button:not([disabled]), input:not([type=hidden]), select, textarea";
async function main() {
  const browser = await chromium.launch();
  let fail = 0, total = 0;
  for (const [slug, route, w] of CASES) {
    const ctx = await newCtx(browser, w, "no-preference");
    const page = await ctx.newPage();
    await gotoRetry(page, origin(slug) + route);
    await page.addStyleTag({ content: "html{scroll-padding:0 !important;scroll-behavior:auto !important}" });
    await page.waitForTimeout(1500);
    const count = (await page.evaluate(`[...document.querySelectorAll("[data-reveal],[data-reveal-item]")].length`)) as number;
    for (let i = 0; i < count; i++) {
      const r = (await page.evaluate(`(async () => {
        const blocks = [...document.querySelectorAll("[data-reveal],[data-reveal-item]")];
        const b = blocks[${i}];
        if (!b || parseFloat(getComputedStyle(b).opacity) > 0.01) return null; // already revealed
        const f = b.querySelector(${JSON.stringify(FOCUSABLE)});
        if (!f || f.closest("[hidden],[aria-hidden=true]")) return null;
        const top = b.getBoundingClientRect().top + scrollY;
        window.scrollTo(0, Math.max(0, top - innerHeight + 40));
        await new Promise((res) => setTimeout(res, 400));
        f.focus({ preventScroll: true });
        await new Promise((res) => setTimeout(res, 1500));
        let op = 1;
        for (let n = f; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
        const fr = f.getBoundingClientRect();
        return { label: (f.innerText || f.getAttribute("aria-label") || f.tagName).trim().slice(0, 30), focused: document.activeElement === f, op: Math.round(op * 100) / 100, blockTop: Math.round(b.getBoundingClientRect().top), vh: innerHeight, inView: fr.top < innerHeight };
      })()`)) as null | { label: string; focused: boolean; op: number; blockTop: number; vh: number; inView: boolean };
      if (!r) continue;
      total++;
      const ok = r.focused && r.op >= 0.99;
      if (!ok) fail++;
      console.log(`${ok ? "PASS" : "FAIL"} ${slug}${route} @${w} block#${i} '${r.label}' focused=${r.focused} effectiveOpacity=${r.op} blockTop=${r.blockTop}/${r.vh}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(!total ? "FAIL (no unrevealed focusable block found)" : fail ? `FAIL (${fail}/${total})` : `PASS (${total} blocks)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
