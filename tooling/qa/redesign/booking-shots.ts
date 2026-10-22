import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Booking-module redesign screenshots (phase 2, booking agent).
 *   pnpm exec tsx qa/redesign/booking-shots.ts [--sites=clinic,salon,course] [--only=services,staff] [--w=1440,390] [--reduce] [--top]
 * → tooling/screenshots/redesign-booking-<site>-<name>-<w>.png (full page; --top = first viewport only)
 * Prints console errors, hydration warnings, horizontal overflow and live canvases per page.
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const SITES = (args.sites ?? "clinic,salon,course").split(",");
const ONLY = args.only ? args.only.split(",") : null;
const WIDTHS = (args.w ?? "1440,390").split(",").map(Number);
const REDUCE = !!args.reduce;
const TOP = !!args.top;
/** --frames: viewport frames every 0.85 vh composed into a contact sheet (what a visitor actually sees while scrolling) */
const FRAMES = !!args.frames;
const SHOTS = path.resolve(process.cwd(), "screenshots");

const ROUTES: Record<string, Array<[string, string]>> = {
  clinic: [["home", "/"], ["services", "/services"], ["services-cat", "/services?category=laser"], ["service", "/services/botox"], ["staff", "/staff"], ["staff-profile", "/staff/dr-nicha"], ["packages", "/packages"], ["book", "/book"], ["book-date", "/book?service=botox&staff=dr-nicha"]],
  salon: [["home", "/"], ["services", "/services"], ["services-cat", "/services?category=skin"], ["service", "/services/aroma-90"], ["staff", "/staff"], ["staff-profile", "/staff/mali"], ["book", "/book"], ["gallery", "/gallery"]],
  course: [["home", "/"], ["classes", "/classes"], ["classes-beginner", "/classes?level=beginner"], ["class", "/classes/hatha-basic"], ["schedule", "/schedule"], ["instructors", "/instructors"], ["instructor", "/instructors/kru-nan"], ["packages", "/packages"], ["start", "/start"], ["book", "/book?service=hatha-basic"]],
};

async function settle(page: Page) {
  // walk the page so in-view reveals fire, then return to the top
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: REDUCE ? "reduce" : "no-preference", isMobile: w < 768, hasTouch: w < 768 });
    await isolateHmr(ctx);
    for (const site of SITES) {
      for (const [name, route] of ROUTES[site] ?? []) {
        if (ONLY && !ONLY.includes(name)) continue;
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error" || /hydrat/i.test(m.text())) errs.push(m.text().slice(0, 200));
        });
        page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
        try {
          const res = await stableGoto(page, `http://demo-${site}.localhost:3000${route}`, "load");
          await page.waitForTimeout(1200);
          if (!TOP) await settle(page);
          else await page.waitForTimeout(1500);
          const info = await page.evaluate(() => ({
            ov: document.documentElement.scrollWidth - window.innerWidth,
            canv: [...document.querySelectorAll("[data-scene-status]")].map((e) => (e as HTMLElement).dataset.sceneStatus).join(","),
          }));
          const file = path.join(SHOTS, `redesign-booking-${site}-${name}${REDUCE ? "-reduce" : ""}-${w}.png`);
          if (FRAMES) {
            const vh = page.viewportSize()!.height;
            const total = await page.evaluate(() => document.documentElement.scrollHeight);
            const shots: string[] = [];
            for (let y = 0; y < total - 40 && shots.length < 24; y += Math.round(vh * 0.85)) {
              await page.evaluate((yy) => window.scrollTo(0, yy), y);
              await page.waitForTimeout(950);
              shots.push((await page.screenshot({ type: "jpeg", quality: 70 })).toString("base64"));
            }
            const cols = w < 768 ? 6 : 3;
            const sheet = await ctx.newPage();
            await sheet.setViewportSize({ width: 1800, height: 900 });
            await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${shots.map((b, i) => `<figure style="margin:0;color:#aaa;font:11px monospace"><img style="width:100%;display:block" src="data:image/jpeg;base64,${b}">f${String(i).padStart(2, "0")}</figure>`).join("")}</body>`, { waitUntil: "load" });
            await sheet.screenshot({ path: file, fullPage: true });
            await sheet.close();
          } else await page.screenshot({ path: file, fullPage: !TOP });
          console.log(`${res?.status()} ${site} ${name} ${w}: overflow=${info.ov}px scenes=[${info.canv}] errors=${errs.length}${errs.length ? `\n   ${[...new Set(errs)].slice(0, 5).join("\n   ")}` : ""}`);
        } catch (e) {
          console.log(`FAIL ${site} ${name} ${w}: ${(e as Error).message.split("\n")[0]}`);
        } finally {
          await page.close();
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
