import { chromium } from "@playwright/test";
/** Confirms script execution for SEC-001 (custom CSS on sec-a) and SEC-008 (slip HTML served on another tenant's origin). */
async function main() {
  const [slipPath] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on("console", (m) => { if (m.text().startsWith("SEC-XSS")) logs.push(m.text()); });
  await page.goto("http://sec-a.localhost:3000/", { waitUntil: "load" });
  console.log("sec-a status/title:", await page.title(), "window.__secXss =", await page.evaluate(() => (window as unknown as { __secXss?: number }).__secXss), logs.join(","));
  if (slipPath) {
    await page.goto(`http://demo-shop.localhost:3000${slipPath}`, { waitUntil: "load" });
    console.log("slip on demo-shop origin -> title:", await page.title(), "origin:", await page.evaluate(() => location.origin));
    await page.screenshot({ path: "screenshots/bughunt-security-slip-xss.png" });
  }
  await browser.close();
}
main();
