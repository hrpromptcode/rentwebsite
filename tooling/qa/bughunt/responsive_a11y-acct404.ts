import "../../load-env";
import { chromium } from "@playwright/test";
/** responsive_a11y: signed-in account pages - which resource 404s, and account nav links. */
async function main() {
  const browser = await chromium.launch();
  for (const slug of ["demo-shop", "demo-clinic"]) {
    const O = `http://${slug}.localhost:3000`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(O + "/account/login", { waitUntil: "networkidle" });
    await page.fill("#otp-target", "089" + String(Date.now()).slice(-7));
    await page.locator('form button[type="submit"]').first().click();
    const codeEl = page.locator("span.font-mono").first(); await codeEl.waitFor({ timeout: 20000 });
    await page.fill("#otp-code", (await codeEl.textContent())!.trim());
    if (await page.locator("#otp-name").count()) await page.fill("#otp-name", "QA RA");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 30000 }).catch(() => {});
    page.on("response", (r) => { if (r.status() >= 400) console.log(`  ${r.status()} ${r.request().resourceType()} ${r.url().slice(0, 160)} <- ${page.url()}`); });
    for (const route of ["/account", "/account/packages", "/checkout", "/account/orders"]) {
      await page.goto(O + route, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(1000);
      const links = await page.evaluate(`[...document.querySelectorAll('main a[href^="/account"]')].map(a => a.getAttribute('href'))`);
      console.log(`${slug} ${route} -> ${page.url()} account links in main: ${JSON.stringify([...new Set(links as string[])])}`);
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
