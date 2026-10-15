import "./load-env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/**
 * Screenshots demo tenants at desktop + mobile widths (animations disabled) into tooling/screenshots/.
 *   pnpm --filter @rentweb/tooling screenshot -- [slug ...] [--path /products] [--full]
 * Requires the web dev server on http://localhost:3000.
 */
const args = process.argv.slice(2);
const pathArg = (() => { const i = args.indexOf("--path"); return i >= 0 ? args[i + 1]! : "/"; })();
const full = args.includes("--full");
const slugs = args.filter((a) => !a.startsWith("--") && a !== pathArg);
const targets = slugs.length ? slugs : ["demo-shop", "demo-topup", "demo-clinic", "demo-restaurant", "demo-salon", "demo-corporate", "demo-cafe"];
const port = process.env.PORT ?? "3000";

async function main() {
  const outDir = path.resolve(process.cwd(), "screenshots");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const slug of targets) {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const url = `http://${slug}.localhost:${port}${pathArg}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(800);
      const file = path.join(outDir, `${slug}${pathArg === "/" ? "" : pathArg.replace(/\//g, "_")}-${name}.png`);
      await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
      console.log("✓", file);
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
