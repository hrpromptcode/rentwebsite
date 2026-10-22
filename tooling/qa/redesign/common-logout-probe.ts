/**
 * common agent: reproduce the console error seen in line_login-journey step Z — OTP login on demo-shop, press
 * "ออกจากระบบ" (server action → redirect("/")), print console errors. Also a plain client navigation to "/" for comparison.
 *   cd tooling && pnpm exec tsx qa/redesign/common-logout-probe.ts
 */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const shop = (p: string) => `http://demo-shop.localhost:3000${p}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await isolateHmr(ctx);
const page = await ctx.newPage();
let phase = "login";
const out: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") out.push(`[${phase}] ${m.text().slice(0, 200)}`);
});
await stableGoto(page, shop("/account/login"), "load");
await page.fill("#otp-target", "0819990012");
await page.locator("form button[type=submit]").first().click();
await page.locator("#otp-code").waitFor({ timeout: 60_000 });
const code = (await page.locator("body").innerText()).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
await page.fill("#otp-code", code!);
await page.locator("form button[type=submit]").first().click();
await page.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
await page.waitForTimeout(1500);
phase = "logout";
await page.getByRole("button", { name: /ออกจากระบบ/ }).first().click();
await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
await page.waitForTimeout(2500);
phase = "link-nav";
await stableGoto(page, shop("/about"), "load");
await page.locator("header a[href='/']").first().click();
await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
await page.waitForTimeout(2500);
console.log(out.join("\n") || "no errors");
await browser.close();
