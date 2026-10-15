import "./load-env";
import { chromium } from "@playwright/test";

/**
 * Smoke-tests every demo tenant's key routes in a real browser: HTTP status, console errors,
 * failed requests and horizontal overflow at mobile width.
 *   pnpm --filter @rentweb/tooling smoke            # all tenants
 *   pnpm --filter @rentweb/tooling smoke -- demo-shop
 * Exit code 1 when any route fails. Requires the web dev server on http://localhost:3000.
 */
const port = process.env.PORT ?? "3000";
const ROUTES: Record<string, string[]> = {
  "demo-shop": ["/", "/products", "/cart", "/checkout", "/about", "/contact", "/account/login", "/orders/track", "/privacy"],
  "demo-cafe": ["/", "/products", "/cart", "/contact"],
  "demo-topup": ["/", "/games", "/games/rov", "/wallet", "/topup/status", "/how-to", "/contact"],
  "demo-clinic": ["/", "/book", "/services", "/staff", "/packages", "/gallery", "/contact"],
  "demo-salon": ["/", "/book", "/services", "/staff", "/gallery", "/contact"],
  "demo-restaurant": ["/", "/menu", "/order", "/reserve", "/about", "/contact"],
  "demo-corporate": ["/", "/services", "/work", "/careers", "/about", "/contact"],
};

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = only.length ? only : Object.keys(ROUTES);

async function main() {
  const browser = await chromium.launch();
  let failures = 0;
  const rows: string[] = [];
  for (const slug of targets) {
    for (const route of ROUTES[slug] ?? ["/"]) {
      for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
        const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
        page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
        page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url().slice(0, 100)}`));
        let status = 0;
        try {
          const res = await page.goto(`http://${slug}.localhost:${port}${route}`, { waitUntil: "networkidle", timeout: 120_000 });
          status = res?.status() ?? 0;
        } catch (e) {
          errors.push(`navigation: ${(e as Error).message.slice(0, 120)}`);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
        const placeholder = await page.locator("text=ยังไม่มีคอมโพเนนต์").count().catch(() => 0);
        const ok = (status === 200 || status === 302) && errors.length === 0 && overflow <= 1 && placeholder === 0;
        if (!ok) failures++;
        rows.push(`${ok ? "✓" : "✗"} ${slug}${route} [${name}] ${status}${overflow > 1 ? ` overflow+${overflow}px` : ""}${placeholder ? ` ${placeholder} missing-section` : ""}${errors.length ? ` | ${errors.slice(0, 2).join(" | ")}` : ""}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(rows.join("\n"));
  console.log(`\n${failures === 0 ? "✓ all routes passed" : `✗ ${failures} failing route checks`}`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
