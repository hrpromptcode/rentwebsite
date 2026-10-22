import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * qa-b helper — viewport shots of specific spots:
 *   pnpm exec tsx qa/redesign/_qab-el.ts <site> <path> <w> <name> [selector|y=px] [more selectors...]
 * Each target is scrolled to (selector → scrollIntoView center; y=px → scrollTo) and the viewport saved as
 * screenshots/redesign-qa-b-el-<name>-<i>.png. Env MODE=reduce|nogl.
 */
const [site, route, wArg, name, ...targets] = process.argv.slice(2);
const w = Number(wArg ?? 1440);
const MODE = process.env.MODE ?? "normal";
const browser = await chromium.launch({ args: MODE === "nogl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: MODE === "reduce" ? "reduce" : "no-preference", isMobile: w < 768, hasTouch: w < 768 });
await isolateHmr(ctx);
await ctx.addInitScript("window.__name = (f) => f");
const page = await ctx.newPage();
const errs: string[] = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errs.push(`pageerror ${e.message.slice(0, 200)}`));
try {
  await stableGoto(page, `http://demo-${site}.localhost:3000${route}`, "load");
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  const list = targets.length ? targets : ["y=0"];
  for (let i = 0; i < list.length; i++) {
    const t = list[i]!;
    if (t.startsWith("y=")) await page.evaluate((yy) => window.scrollTo(0, yy), Number(t.slice(2)));
    else await page.locator(t).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1600);
    const file = path.resolve(process.cwd(), "screenshots", `redesign-qa-b-el-${name}-${i}.png`);
    await page.screenshot({ path: file, timeout: 120_000 });
    console.log(file);
  }
} finally {
  if (errs.length) console.log("ERR", errs.join("\n"));
  await browser.close();
}
