import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/**
 * web_visual RA-01: on the minimal/sidebar header (demo-salon, zen preset) every owner-configured nav item must be
 * reachable at every width — inline links + the menu sheet at md+, the sheet on phones. The classic header
 * (demo-shop) must keep its menu button phone-only. Prints PASS/FAIL.
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RA-01-verify.ts
 */
async function main() {
  const browser = await chromium.launch();
  let fails = 0;
  const check = (ok: boolean, msg: string) => { if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
  for (const width of [390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await stableGoto(page, "http://demo-salon.localhost:3000/");
    const inline = await page.locator("header nav a:visible").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    const btn = page.getByRole("button", { name: "เปิดเมนู" });
    const btnVisible = await btn.isVisible();
    let sheet: (string | null)[] = [];
    if (btnVisible) {
      await btn.click();
      await page.waitForTimeout(500);
      sheet = await page.locator("[data-slot=sheet-content] nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    }
    const reachable = new Set([...inline, ...sheet]);
    check(btnVisible && ["/services", "/staff", "/gallery", "/about", "/contact"].every((h) => reachable.has(h)), `salon ${width}: inline=${inline.join(",")} menuButton=${btnVisible} sheet=${sheet.join(",")}`);
    await ctx.close();
  }
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await stableGoto(page, "http://demo-shop.localhost:3000/");
    const btnVisible = await page.getByRole("button", { name: "เปิดเมนู" }).isVisible();
    check(btnVisible === width < 768, `shop (classic) ${width}: menuButton=${btnVisible}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `FAIL ${fails}` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
