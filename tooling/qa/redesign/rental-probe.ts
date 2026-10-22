import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Rental redesign probe: open a demo-hotel route, scroll a selector into view (block: start|center) and save the viewport.
 *   pnpm exec tsx qa/redesign/rental-probe.ts --route=/ --sel='[data-section="interlude"]' [--w=1440] [--block=start] [--name=x] [--reduce] [--dark] [--wait=1800] [--nth=0]
 * → tooling/screenshots/redesign-rental-probe-<name>-<w>.png
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split(/=(.*)/s)).map(([k, v]) => [k, v ?? "1"]));
const W = Number(args.w ?? 1440);
const ROUTE = args.route ?? "/";
const SEL = args.sel ?? "body";
const NAME = args.name ?? "probe";
const BLOCK = (args.block ?? "start") as ScrollLogicalPosition;
const NTH = Number(args.nth ?? 0);
const WAIT = Number(args.wait ?? 1800);

async function main() {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 768 ? 844 : 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: args.reduce ? "reduce" : "no-preference", isMobile: W < 768, hasTouch: W < 768 });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) errs.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
  if (args.dark) await page.addInitScript(() => localStorage.setItem("rw-theme", "dark"));
  await stableGoto(page, `http://demo-hotel.localhost:3000${ROUTE}`, "load");
  await page.waitForTimeout(1200);
  const steps = (args.steps ?? "").split(",").filter(Boolean);
  for (const s of steps) {
    // "y:1200" scroll to y, "click:<selector>"
    const [k, v] = s.split(/:(.*)/s);
    if (k === "y") await page.evaluate((y) => window.scrollTo(0, y), Number(v));
    if (k === "click") await page.locator(v!).first().click();
    await page.waitForTimeout(700);
  }
  if (SEL !== "body") {
    await page.locator(SEL).nth(NTH).evaluate((el, block) => el.scrollIntoView({ block, behavior: "instant" as ScrollBehavior }), BLOCK);
  }
  await page.waitForTimeout(WAIT);
  const file = path.join(process.cwd(), "screenshots", `redesign-rental-probe-${NAME}-${W}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file} errors=${errs.length}${errs.length ? `\n  ${errs.join("\n  ")}` : ""}`);
  await ctx.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
