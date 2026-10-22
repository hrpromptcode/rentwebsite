import path from "node:path";
import { chromium, type ConsoleMessage } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Quick viewport frames of chosen home chapters while iterating on the "Daybreak" design:
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/platform-light-quick.ts --w=1440 --at=top,#templates,@0.5 [--url=/] [--wait=1500] [--tag=x]
 * `top` = first viewport, `#id`/css = scroll that element's top to the viewport top (offset --off px), `@0.5` = fraction of
 * the page, `+1200` = absolute y. → tooling/screenshots/pf-q-<tag>-<i>-<w>.png
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const widths = (arg("w") ?? "1440").split(",").map(Number);
const at = (arg("at") ?? "top").split(",");
const url = arg("url") ?? "/";
const wait = Number(arg("wait") ?? 1500);
const off = Number(arg("off") ?? 0);
const tag = arg("tag") ?? "home";
const reduce = process.argv.includes("--reduce");
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
try {
  for (const w of widths) {
    const mobile = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: reduce ? "reduce" : "no-preference" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "error" || /hydrat|did not match|mismatch/i.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 240)}`);
    });
    page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 240)}`));
    await stableGoto(page, `http://localhost:3000${url}`, "load");
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(1500);
    if (process.argv.includes("--menu")) {
      await page.locator("button[aria-controls='pf-mobile-menu']").click();
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(SHOTS, `pf-q-${tag}-menu-${w}.png`) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
    let i = 0;
    for (const a of at) {
      if (a === "top") await page.evaluate(() => window.scrollTo(0, 0));
      else if (a.startsWith("@")) await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), Number(a.slice(1)));
      else if (a.startsWith("+")) await page.evaluate((y) => window.scrollTo(0, y), Number(a.slice(1)));
      else
        await page.evaluate(
          ([sel, o]) => {
            const el = document.querySelector(sel as string);
            if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + (o as number));
          },
          [a, off] as const,
        );
      await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(SHOTS, `pf-q-${tag}-${i}-${w}.png`) });
      i++;
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`@${w} overflow=${overflow} errors=${errors.length}`);
    for (const e of errors.slice(0, 6)) console.log("  ", e);
    await ctx.close();
  }
} finally {
  await browser.close();
}
