import { launch, newCtx, newPage, out, readCreds, shot, store, type Page } from "./admin_b2-lib";
const T = Object.fromEntries(readCreds().tenants.map((t: any) => [t.key, t.slug]));
const bkkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
async function pickDate(page: Page, minOffset: number) {
  await page.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)').first().waitFor({ timeout: 60_000 });
  const labels = (await page.locator('button[role="gridcell"]:not([aria-disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")))) as string[];
  const t = labels.find((d) => (Date.parse(d) - Date.parse(bkkToday())) / 86400000 >= minOffset);
  await page.locator(`button[role="gridcell"][data-date="${t}"]`).click();
}
async function pickSlot(page: Page) {
  await page.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
  const chips = page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])");
  await chips.first().waitFor({ timeout: 60_000 });
  await chips.first().click();
}
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await newPage(ctx);
  const base = store(T.salon);
  await page.goto(`${base}/book?service=aroma-90`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByText("เลือกผู้ให้บริการ").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }).click();
  await pickDate(page, 2);
  await pickSlot(page);
  await page.fill("#bk-name", "คุณทดสอบ บีทู");
  await page.fill("#bk-phone", "0899990002");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
  const review = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  out("review step", review.slice(review.indexOf("ตรวจสอบ"), review.indexOf("ตรวจสอบ") + 600));
  await page.getByRole("button", { name: "ยืนยันการจอง" }).click();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  out("booking page", t.slice(0, 1200));
  await page.screenshot({ path: shot("book-new-salon-deposit"), fullPage: true });
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
