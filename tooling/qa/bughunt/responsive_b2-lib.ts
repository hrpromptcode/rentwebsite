import { readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./fixes/_dev-stable";

/** responsive_b2 bughunt shared helpers. Run scripts from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/responsive_b2-<x>.ts */
export const HERE = path.resolve("qa/bughunt");
export const SHOTS = path.resolve("screenshots");
export const CHECKS = readFileSync(path.join(HERE, "responsive_b2-checks.js"), "utf8").replace(/^\s*\/\/.*\n/, "").trim();
export const TENANTS = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
export const origin = (slug: string) => `http://${slug}.localhost:3000`;
export { isolateHmr, stableGoto };

export async function newCtx(browser: Browser, width: number, rm: "reduce" | "no-preference", storageState?: string) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    reducedMotion: rm,
    deviceScaleFactor: 1,
    isMobile: width < 768,
    hasTouch: width < 768,
    storageState,
  });
  await isolateHmr(ctx);
  return ctx;
}

export function watchConsole(page: Page) {
  const logs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text().slice(0, 500)}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.slice(0, 500)}`));
  return logs;
}

/** goto with retries for dev compile errors / 500s (other agents edit files concurrently). */
export async function gotoRetry(page: Page, url: string, waitUntil: "load" | "networkidle" = "networkidle") {
  let res = null as Awaited<ReturnType<Page["goto"]>>;
  for (let i = 0; i < 3; i++) {
    try {
      res = await stableGoto(page, url, waitUntil);
    } catch (e) {
      if (i === 2) throw e;
      await page.waitForTimeout(10_000);
      continue;
    }
    const st = res?.status() ?? 0;
    const compileErr = await page.locator("nextjs-portal").evaluateAll((els) => els.some((e) => (e.shadowRoot?.textContent ?? "").match(/Build Error|Failed to compile|Module not found/))).catch(() => false);
    if (st < 500 && !compileErr) return res;
    if (i < 2) await page.waitForTimeout(10_000);
  }
  return res;
}

export async function runChecks(page: Page, opts: Record<string, unknown>) {
  return (await page.evaluate(`(${CHECKS})(${JSON.stringify(opts)})`)) as Record<string, any>;
}

export async function scrollThrough(page: Page) {
  await page.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 140)); } window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 1200)); })()`);
}

/** Customer OTP sign-in on a storefront (dev prints the code). Returns the phone used. */
export async function otpLogin(page: Page, slug: string, phone = "089" + String(Date.now()).slice(-7), name = "QA B2 ทดสอบ") {
  await gotoRetry(page, origin(slug) + "/account/login");
  await page.fill("#otp-target", phone);
  await page.locator('form button[type="submit"]').first().click();
  const codeEl = page.locator("span.font-mono").first();
  await codeEl.waitFor({ timeout: 30_000 });
  const code = (await codeEl.textContent())!.trim();
  await page.fill("#otp-code", code);
  if (await page.locator("#otp-name").count()) await page.fill("#otp-name", name);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 30_000 }).catch(() => {});
  return phone;
}

export type Ctx = BrowserContext;
