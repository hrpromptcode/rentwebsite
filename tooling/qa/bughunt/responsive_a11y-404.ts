import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: which sub-resources 404 on pages that log 'Failed to load resource'. */
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.request().resourceType(), r.url().slice(0, 200), "<-", page.url()); });
  for (const u of ["http://demo-shop.localhost:3000/checkout", "http://demo-clinic.localhost:3000/account/packages", "http://demo-shop.localhost:3000/products/sofa-throw", "http://demo-clinic.localhost:3000/packages"]) {
    await page.goto(u, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
