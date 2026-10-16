import "../load-env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/** Screenshots unauthenticated admin pages (login, signup) at desktop + mobile into tooling/screenshots/admin-<page>-<vp>.png.
 *  MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/admin-shots-unauth.ts */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function main() {
  const outDir = path.resolve(process.cwd(), "screenshots");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const [vp, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const p of ["/login", "/signup"]) {
      await page.goto(`${ADMIN}${p}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(600);
      const file = path.join(outDir, `admin-${p.slice(1)}-${vp}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("wrote", file);
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
