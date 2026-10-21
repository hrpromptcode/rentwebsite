import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/** kit3d debug probe: scroll to a lab plate and print window.__rwDbg + console. tsx qa/redesign/kit3d-debug.ts <plateId> [expr] */
const id = process.argv[2] ?? "objects-fashion";
const expr = process.argv[3] ?? "JSON.stringify(window.__rwDbg ?? null)";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await isolateHmr(ctx);
const page = await ctx.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 400)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await stableGoto(page, "http://localhost:3000/lab/3d", "load");
await page.locator(`#${id}`).scrollIntoViewIfNeeded();
await page.waitForTimeout(3500);
console.log(await page.evaluate(expr));
await browser.close();
