import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Signed-in operational pages (OTP dev code is shown inline on demos):
 *   pnpm exec tsx qa/redesign/booking-account-shots.ts [--site=clinic] [--w=1440] [--phone=0899001122]
 * → tooling/screenshots/redesign-booking-<site>-account-{bookings,packages,package,buy}-<w>.png
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, ...v]) => [k, v.join("=") || "1"]));
const SITE = args.site ?? "clinic";
const W = Number(args.w ?? 1440);
const PHONE = args.phone ?? "0899001122";
const SHOTS = path.resolve(process.cwd(), "screenshots");
const ORIGIN = `http://demo-${SITE}.localhost:3000`;

const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: W, height: W < 768 ? 844 : 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: W < 768, hasTouch: W < 768 });
await isolateHmr(ctx);
const p = await ctx.newPage();
const errs: string[] = [];
p.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errs.push(`${p.url().replace(ORIGIN, "")}: ${m.text().slice(0, 160)}`));
const shot = async (name: string, full = true) => {
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(SHOTS, `redesign-booking-${SITE}-account-${name}-${W}.png`), fullPage: full });
};
try {
  await stableGoto(p, `${ORIGIN}/account/login?next=%2Faccount%2Fbookings`, "load");
  await p.fill("#otp-target", PHONE);
  await p.locator('form button[type="submit"]').click();
  await p.locator("#otp-code").waitFor({ timeout: 60_000 });
  const code = (await p.evaluate(() => document.body.innerText)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
  if (!code) throw new Error("no dev OTP");
  await p.fill("#otp-code", code);
  if (await p.locator("#otp-name").isVisible().catch(() => false)) await p.fill("#otp-name", "คุณทดสอบ ดีไซน์");
  await p.locator('form button[type="submit"]').click();
  await p.waitForURL((u) => u.pathname.startsWith("/account/bookings"), { timeout: 60_000 });
  await shot("bookings");
  await stableGoto(p, `${ORIGIN}/account/packages`, "load");
  await shot("packages");
  const first = await p.locator('a[href^="/account/packages/"]').first().getAttribute("href").catch(() => null);
  if (first) {
    await stableGoto(p, `${ORIGIN}${first}`, "load");
    await shot("package");
  }
  await stableGoto(p, `${ORIGIN}/packages`, "load");
  const buy = await p.locator('a[href$="/buy"]').first().getAttribute("href");
  await stableGoto(p, `${ORIGIN}${buy}`, "load");
  await shot("buy");
  console.log(`ok ${SITE} ${W} errors=${errs.length}${errs.length ? `\n  ${[...new Set(errs)].join("\n  ")}` : ""}`);
} catch (e) {
  console.log(`FAIL ${(e as Error).message.split("\n")[0]}`);
  await p.screenshot({ path: path.join(SHOTS, `redesign-booking-${SITE}-account-FAIL-${W}.png`) });
} finally {
  await b.close();
}
