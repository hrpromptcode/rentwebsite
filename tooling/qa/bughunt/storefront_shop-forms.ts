import "../../load-env";
import { chromium } from "@playwright/test";

/** Contact/lead form checks on demo-shop/cafe/corporate (storefront_shop bughunt). */
const TENANTS = ["demo-shop", "demo-cafe", "demo-corporate"];
const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const browser = await chromium.launch();
  const stamp = String(Date.now()).slice(-6);
  for (const slug of TENANTS) {
    const origin = `http://${slug}.localhost:3000`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "th-TH", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
    await page.goto(`${origin}/contact`, { waitUntil: "networkidle", timeout: 90_000 });
    const hasForm = await page.locator("#cf-name").count();
    log(`[${slug}] /contact form present: ${hasForm}`);
    if (!hasForm) {
      await ctx.close();
      continue;
    }
    // 1) empty submit -> native validation message
    await page.locator("#cf-name").scrollIntoViewIfNeeded();
    await page.locator('form:has(#cf-name) button[type="submit"]').click();
    const nativeMsg = await page.locator("#cf-name").evaluate("(el) => el.validationMessage");
    log(`[${slug}] empty submit native validationMessage: "${nativeMsg}"`);
    // 2) short phone / bad email -> server
    await page.fill("#cf-name", "ทดสอบ ฟอร์ม");
    await page.fill("#cf-phone", "12");
    await page.fill("#cf-message", "ข้อความทดสอบ");
    const r1 = page.waitForResponse((r) => r.url().includes("/api/forms/"), { timeout: 20_000 }).catch(() => null);
    await page.locator('form:has(#cf-name) button[type="submit"]').click();
    const res1 = await r1;
    await page.waitForTimeout(500);
    log(`[${slug}] phone "12" -> http ${res1?.status()} msg: "${await page.locator("form:has(#cf-name) p.text-destructive").first().textContent().catch(() => null)}"`);
    await page.fill("#cf-phone", "abcdefgh");
    const r2 = page.waitForResponse((r) => r.url().includes("/api/forms/"), { timeout: 20_000 }).catch(() => null);
    await page.locator('form:has(#cf-name) button[type="submit"]').click();
    const res2 = await r2;
    log(`[${slug}] phone "abcdefgh" -> http ${res2?.status()}`);
    await page.waitForTimeout(800);
    if (await page.getByRole("button", { name: "ส่งอีกข้อความ" }).count()) await page.getByRole("button", { name: "ส่งอีกข้อความ" }).click();
    // 3) valid submit
    await page.fill("#cf-name", `QA ฟอร์ม ${stamp}`);
    await page.fill("#cf-phone", "0812345678");
    await page.fill("#cf-email", "qa-form@example.com");
    await page.fill("#cf-message", `ข้อความทดสอบ ${stamp}`);
    const r3 = page.waitForResponse((r) => r.url().includes("/api/forms/"), { timeout: 20_000 }).catch(() => null);
    await page.locator('form:has(#cf-name) button[type="submit"]').click();
    const res3 = await r3;
    await page.waitForTimeout(800);
    log(`[${slug}] valid -> http ${res3?.status()} url=${res3?.url().replace(origin, "")} sentText=${await page.getByText("ส่งอีกข้อความ").count()}`);
    log(`[${slug}] console errors:`, errs);
    await ctx.close();
  }
  // 4) arbitrary slug auto-creates a form row
  const ctx = await browser.newContext();
  const res = await ctx.request.post(`http://demo-corporate.localhost:3000/api/forms/qa-bogus-${stamp}`, { data: { name: "x", message: "y" } });
  log(`POST /api/forms/qa-bogus-${stamp} -> ${res.status()} ${await res.text()}`);
  const res5 = await ctx.request.post(`http://demo-corporate.localhost:3000/api/forms/contact`, { data: { name: "x", message: "y", extra: "z".repeat(200_000) } });
  log(`POST contact with 200KB extra field -> ${res5.status()}`);
  await browser.close();
  log("stamp", stamp);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
