/** reverify-repro (SBR-014): what does /reserve show for a party of 40 in the 24-seat garden? Screenshot + visible text. */
import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://demo-restaurant.localhost:3000/reserve?date=2026-12-09&time=12:00&size=40&zone=${encodeURIComponent("สวน")}`, { waitUntil: "networkidle", timeout: 120_000 });
  await p.locator("#res-name").fill("คิวเอ 40 คน");
  await p.locator("#res-phone").fill("0897776655");
  await p.waitForTimeout(2500);
  const form = (await p.locator("form").first().innerText()).replace(/\s+/g, " ");
  console.log("form text:", form.slice(0, 900));
  const btn = p.getByRole("button", { name: /ยืนยันการจอง/ });
  console.log("submit disabled:", await btn.first().isDisabled());
  await p.screenshot({ path: "screenshots/reverify-repro-sbr014-party40.png", fullPage: true });
  await b.close();
}
main();
