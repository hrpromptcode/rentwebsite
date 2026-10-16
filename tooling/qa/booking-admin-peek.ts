import "../load-env";
import { chromium } from "@playwright/test";

/** Debug helper: logs in and prints the visible text / error of admin pages.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/booking-admin-peek.ts /t/demo-salon/staff [...] */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function main() {
  const urls = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  for (const u of urls) {
    const errs: string[] = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 400)));
    const r = await page.goto(`${ADMIN}${u}`, { waitUntil: "networkidle", timeout: 90_000 });
    const body = await page.evaluate(() => document.body.innerText);
    console.log(`=== ${u} → ${r?.status()}`);
    console.log(body.slice(0, 1500));
    const dims = await page.evaluate(() => {
      const out: string[] = [];
      const vw = document.documentElement.clientWidth;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.right > vw + 1 && (el as HTMLElement).offsetParent !== null) out.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 80)} right=${Math.round(r.right)}`);
        if (out.length > 8) break;
      }
      return { sw: document.documentElement.scrollWidth, vw, out };
    });
    console.log(`scrollWidth ${dims.sw} / ${dims.vw}`);
    for (const o of dims.out) console.log("  overflow:", o);
    if (errs.length) console.log("console errors:\n  " + errs.slice(0, 5).join("\n  "));
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
