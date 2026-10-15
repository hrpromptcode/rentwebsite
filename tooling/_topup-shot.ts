import "./load-env";
import path from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
/** Logged-in screenshots for the top-up demo: tsx _topup-shot.ts /wallet /account/topups /topup/TP-1001 */
const paths = process.argv.slice(2).filter((a) => a.startsWith("/"));
const base = "http://demo-topup.localhost:3000";
async function login(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.goto(`${base}/account/login?next=%2Fwallet`, { waitUntil: "networkidle" });
  await page.getByLabel("เบอร์โทรศัพท์").fill("0812345678");
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const codeText = await page.getByText(/รหัสของคุณคือ/).textContent({ timeout: 30_000 });
  const code = codeText?.match(/(\d{6})/)?.[1];
  if (!code) throw new Error("no dev otp code on page");
  await page.getByLabel("กรอกรหัส OTP 6 หลัก").fill(code);
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await page.waitForURL(/\/wallet/, { timeout: 60_000 });
  await page.close();
}
async function main() {
  const outDir = path.resolve(process.cwd(), "screenshots");
  const browser = await chromium.launch();
  const auth = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(auth);
  const state = await auth.storageState();
  await auth.close();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, storageState: state, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (const p of paths) {
      await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(1200);
      const file = path.join(outDir, `demo-topup${p.replace(/[^a-z0-9]+/gi, "_")}-${name}.png`);
      await page.screenshot({ path: file, animations: "disabled" });
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log(`✓ ${file}${scrollW > viewport.width ? `  ⚠ horizontal overflow ${scrollW}px` : ""}`);
    }
    for (const e of errors.slice(0, 3)) console.log(`   ✗ ${e}`);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
