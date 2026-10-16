import { chromium } from "@playwright/test";
/** Captures the raw server-action request the OTP form sends (to replicate it over HTTP). */
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) {
      console.log("ACTION", r.url(), JSON.stringify(r.headers()).slice(0, 600));
      console.log("BODY", JSON.stringify(r.postData()).slice(700, 1400));
    }
  });
  await page.goto("http://demo-shop.localhost:3000/account/login", { waitUntil: "networkidle" });
  await page.fill("#otp-target", "0899990001");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("TEXT", (await page.locator("body").innerText()).match(/รหัสของคุณคือ\s*\d+/)?.[0]);
  await browser.close();
}
main();
