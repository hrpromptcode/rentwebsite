import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

/** booking: OTP customer → package → "จองคิวใช้สิทธิ์" → book; /account/bookings; owner cancel; bank-transfer deposit panel. */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
const clinic = "http://demo-clinic.localhost:3000";
const salon = "http://demo-salon.localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const log = (s: string) => console.log(s);
const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const want = (k: string) => !only.length || only.includes(k);
const body = (p: Page) => p.evaluate(() => document.body.innerText);
const PHONE = process.env.QA_PHONE ?? "0899001177";

async function otpLogin(p: Page, origin: string, next: string) {
  await p.goto(`${origin}/account/login?next=${encodeURIComponent(next)}`);
  await p.fill("#otp-target", PHONE);
  await p.locator('form button[type="submit"]').click();
  await p.locator("#otp-code").waitFor({ timeout: 60_000 });
  const code = (await body(p)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
  if (!code) throw new Error("no dev OTP");
  await p.fill("#otp-code", code);
  if (await p.locator("#otp-name").count()) await p.fill("#otp-name", "คิวเอ แพ็กเกจ");
  await p.locator('form button[type="submit"]').click();
  await p.waitForURL((u) => !u.pathname.includes("/account/login"), { timeout: 60_000 });
}
async function pickDate(page: Page, minOffset: number): Promise<string> {
  await page.locator('button[role="gridcell"]:not([disabled]):not(.animate-pulse)').first().waitFor();
  const labels = (await page.locator('button[role="gridcell"]:not([disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) as string[];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const t = labels.find((d) => (Date.parse(d) - Date.parse(today)) / 86400000 >= minOffset);
  if (!t) throw new Error("no date");
  await page.locator(`button[role="gridcell"][aria-label="${t}"]`).click();
  return t;
}
async function pickSlot(page: Page, idx = 0) {
  await page.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
  const chips = page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])");
  await chips.first().waitFor();
  await chips.nth(idx).click();
}

async function main() {
  const browser = await chromium.launch();
  const mk = async (mobile = true) => {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30_000);
    p.setDefaultNavigationTimeout(90_000);
    return { ctx, p };
  };

  if (want("pkg")) {
    const { p, ctx } = await mk();
    try {
      await otpLogin(p, clinic, "/account/bookings");
      const t0 = await body(p);
      log(`P0 /account/bookings (new customer) url=${p.url().replace(clinic, "")} empty=${/ยังไม่มี/.test(t0)}`);
      await p.goto(`${clinic}/packages`);
      const href = (await p.locator('a[href^="/packages/"][href$="/buy"]').first().getAttribute("href"))!;
      await p.goto(`${clinic}${href}`);
      await p.locator('input[name="consent"]').check();
      await p.locator('form button[type="submit"]', { hasText: "ซื้อแพ็กเกจ" }).click();
      await p.waitForURL(/\/account\/packages\/[0-9a-f-]{36}$/, { timeout: 60_000 });
      await p.getByText("แนบสลิปโอนเงิน").waitFor();
      await p.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
      await p.getByText("ชำระเงินสำเร็จ").waitFor({ timeout: 30_000 });
      await p.reload();
      const tp = await body(p);
      log(`P1 package ${p.url().replace(clinic, "")} active=${tp.includes("ใช้งานได้")} left=${tp.match(/\d+\s*ครั้ง[^\n]*/)?.[0]}`);
      await p.getByRole("link", { name: /จองคิวใช้สิทธิ์/ }).click();
      await p.waitForURL(/\/book/);
      await p.waitForTimeout(1500);
      const tb = await body(p);
      log(`P2 CTA → ${p.url().replace(clinic, "")} serviceStep=${tb.includes("เลือกบริการ")} staffStep=${tb.includes("เลือกผู้ให้บริการ")} mentionsPackage=${/คอร์ส|แพ็กเกจ|สิทธิ์/.test(tb)}`);
      await p.goto(`${clinic}/book?service=pico`);
      await p.getByText("เลือกผู้ให้บริการ").waitFor();
      await p.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }).click();
      await pickDate(p, 3);
      await pickSlot(p, 0);
      await p.getByText("ข้อมูลสำหรับติดต่อ").waitFor();
      await p.getByRole("button", { name: "ถัดไป" }).click();
      await p.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
      const tc = await body(p);
      log(`P3 confirm step pico: price=${tc.match(/฿[\d,]+/g)?.join(",")} mentionsPackage=${/คอร์ส|แพ็กเกจ|ใช้สิทธิ์/.test(tc)}`);
      await p.getByRole("button", { name: "ยืนยันการจอง" }).click();
      await p.waitForURL(/\/bookings\/[0-9a-f-]{36}\?k=/, { timeout: 60_000 });
      await p.getByText("หมายเลขการจอง").waitFor();
      const bk = await body(p);
      log(`P4 booking page: status=${bk.match(/ยืนยันแล้ว|รอชำระมัดจำ/)?.[0]} price=${bk.match(/฿[\d,]+/g)?.join(",")} mentionsPackage=${/คอร์ส|แพ็กเกจ|ใช้สิทธิ์/.test(bk)}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-pkg-booking.png"), fullPage: true });
      const bookingPath = new URL(p.url()).pathname;
      await p.goto(`${clinic}/account/bookings`);
      const ab = await body(p);
      log(`P5 /account/bookings: upcoming=${ab.match(/นัดถัดไป \((\d+)\)/)?.[1]} hasPico=${/Pico/i.test(ab)}`);
      // owner cancel without key
      await p.goto(`${clinic}${bookingPath}`);
      const canCancel = await p.getByRole("button", { name: "ยกเลิกการจอง" }).count();
      log(`P6 owner view without key: cancel button=${canCancel}`);
      if (canCancel) {
        await p.getByRole("button", { name: "ยกเลิกการจอง" }).click();
        await p.fill("#cancel-reason", "ทดสอบ QA");
        await p.getByRole("button", { name: "ยืนยันยกเลิกการจอง" }).click();
        const ok = await p.waitForFunction(() => document.body.innerText.includes("การจองนี้ถูกยกเลิกแล้ว"), null, { timeout: 30_000 }).then(() => true).catch(() => false);
        log(`P6 owner cancel without key → cancelled=${ok} url=${p.url().replace(clinic, "")}`);
      }
    } catch (e) {
      log(`ERROR pkg: ${String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-pkg-fail.png"), fullPage: true }).catch(() => {});
    }
    await ctx.close();
  }

  if (want("bank")) {
    const { p, ctx } = await mk(false);
    try {
      await p.goto(`${salon}/book?service=aroma-90`);
      await p.getByText("เลือกผู้ให้บริการ").waitFor();
      await p.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }).click();
      await pickDate(p, 8);
      await pickSlot(p, 2);
      await p.fill("#bk-name", "คิวเอ โอนธนาคาร");
      await p.fill("#bk-phone", "0862223333");
      await p.getByRole("button", { name: "ถัดไป" }).click();
      await p.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
      await p.getByText("โอนเงินผ่านธนาคาร").first().click();
      await p.getByRole("button", { name: "ยืนยันการจอง" }).click();
      await p.waitForURL(/\/bookings\/[0-9a-f-]{36}\?k=/, { timeout: 60_000 });
      await p.getByText("หมายเลขการจอง").waitFor();
      const t = await body(p);
      log(`B1 bank-transfer booking: panel=${t.includes("ยอดที่ต้องชำระ")} qr=${await p.locator('img[alt="PromptPay QR"]').count()} bankInfo=${/เลขที่บัญชี|บัญชี|ธนาคาร/.test(t)} method=${t.match(/ช่องทาง\s*\n?\s*[^\n]+/)?.[0]?.replace(/\s+/g, " ")}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-bank.png"), fullPage: true });
    } catch (e) {
      log(`ERROR bank: ${String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
