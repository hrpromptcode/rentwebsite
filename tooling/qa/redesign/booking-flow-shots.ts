import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Booking wizard step-by-step screenshots (time / details / confirm / booking page) — books one real slot on the demo.
 *   pnpm exec tsx qa/redesign/booking-flow-shots.ts [--site=salon] [--w=1440] [--service=thai-60&staff=mali]
 * → tooling/screenshots/redesign-booking-<site>-flow-<step>-<w>.png
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, ...v]) => [k, v.join("=") || "1"]));
const SITE = args.site ?? "salon";
const W = Number(args.w ?? 1440);
const Q = args.service ?? "service=thai-60&staff=mali";
const SHOTS = path.resolve(process.cwd(), "screenshots");

const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: W, height: W < 768 ? 844 : 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: W < 768, hasTouch: W < 768 });
await isolateHmr(ctx);
const p = await ctx.newPage();
const errs: string[] = [];
p.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errs.push(m.text().slice(0, 200)));
const shot = async (step: string) => {
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(SHOTS, `redesign-booking-${SITE}-flow-${step}-${W}.png`) });
};
try {
  await stableGoto(p, `http://demo-${SITE}.localhost:3000/book?${Q}`, "load");
  await p.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)').first().waitFor({ timeout: 30_000 });
  await p.locator("[data-step]").first().scrollIntoViewIfNeeded();
  await shot("date");
  const cells = p.locator('button[role="gridcell"]:not([aria-disabled])');
  await cells.nth(Math.min(2, (await cells.count()) - 1)).click();
  await p.locator('h3[data-step="time"]').waitFor();
  await p.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])").first().waitFor({ timeout: 30_000 });
  await shot("time");
  await p.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])").nth(3).click();
  await p.locator("#bk-name").waitFor();
  await p.fill("#bk-name", "คุณทดสอบ ดีไซน์");
  await p.fill("#bk-phone", "0812345678");
  await shot("details");
  await p.getByRole("button", { name: "ถัดไป" }).click();
  await p.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
  await shot("confirm");
  if (!args["no-book"]) {
    await p.getByRole("button", { name: "ยืนยันการจอง" }).click();
    await p.waitForURL(/\/bookings\//, { timeout: 60_000 });
    await p.getByText("หมายเลขการจอง").waitFor();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(SHOTS, `redesign-booking-${SITE}-flow-booked-${W}.png`), fullPage: true });
  }
  console.log(`ok ${SITE} ${W} errors=${errs.length}${errs.length ? `\n  ${[...new Set(errs)].join("\n  ")}` : ""}`);
} catch (e) {
  console.log(`FAIL ${(e as Error).message.split("\n")[0]}`);
  await p.screenshot({ path: path.join(SHOTS, `redesign-booking-${SITE}-flow-FAIL-${W}.png`) });
} finally {
  await b.close();
}
