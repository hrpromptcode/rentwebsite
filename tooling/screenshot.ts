import "./load-env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/**
 * Screenshots demo tenants at desktop + mobile widths into tooling/screenshots/.
 *   pnpm --filter @rentweb/tooling screenshot -- [slug ...] [--path /products] [--full] [--wait 3000] [--motion] [--only desktop|mobile]
 * --motion keeps animations enabled (default: reduced motion + animations disabled for stable captures).
 * Console errors and failed requests are printed per page. Requires the web dev server on http://localhost:3000.
 */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const pathArg = flag("path") ?? "/";
const waitMs = Number(flag("wait") ?? 800);
const only = flag("only");
const full = args.includes("--full");
const motion = args.includes("--motion");
const consumed = new Set([pathArg, flag("wait"), only].filter(Boolean));
const slugs = args.filter((a) => !a.startsWith("--") && !consumed.has(a));
const targets = slugs.length ? slugs : ["demo-shop", "demo-topup", "demo-clinic", "demo-restaurant", "demo-salon", "demo-corporate", "demo-cafe"];
const port = process.env.PORT ?? "3000";

async function main() {
  const outDir = path.resolve(process.cwd(), "screenshots");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const viewports = ([["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const).filter(([n]) => !only || n === only);
  for (const slug of targets) {
    for (const [name, viewport] of viewports) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: motion ? "no-preference" : "reduce" });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 200));
      });
      page.on("requestfailed", (r) => errors.push(`request failed: ${r.url().slice(0, 120)}`));
      const url = `http://${slug}.localhost:${port}${pathArg}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(waitMs);
      const file = path.join(outDir, `${slug}${pathArg === "/" ? "" : pathArg.replace(/[^a-z0-9]+/gi, "_")}-${name}.png`);
      await page.screenshot({ path: file, fullPage: full, animations: motion ? "allow" : "disabled" });
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log(`✓ ${file}${scrollW > viewport.width ? `  ⚠ horizontal overflow ${scrollW}px > ${viewport.width}px` : ""}`);
      for (const e of errors.slice(0, 5)) console.log(`   ✗ ${e}`);
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
