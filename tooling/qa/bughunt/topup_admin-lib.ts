import "../../load-env";
import path from "node:path";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { getAdminDb, getDb, withTenant, type Tx } from "@rentweb/db";
import { isolateHmr } from "./fixes/_dev-stable";

/** Shared helpers for the topup_admin bughunt scripts (QA only; no source changes). */
export const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
export const STORE = "http://demo-topup.localhost:3000";
export const SLUG = "demo-topup";
export const TENANT = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
export const OWNER = { email: "admin@rentweb.local", password: "Admin1234!" };
export const here = path.resolve(process.cwd(), "qa", "bughunt");
export const shotPath = (name: string) => path.resolve(process.cwd(), "screenshots", `bughunt-topup-${name}.png`);
export const RUN = Date.now().toString(36).slice(-5);
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export const adminDb = () => getAdminDb();
export function tt<T>(fn: (tx: Tx) => Promise<T>, tenantId = TENANT): Promise<T> {
  return withTenant(getDb(), tenantId, fn);
}
export function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : (((r as { rows?: T[] }).rows ?? []) as T[]);
}

export function out(label: string, v: unknown) {
  console.log(`## ${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
}
export interface Finding {
  id: string;
  severity: "critical" | "major" | "minor";
  confidence: "confirmed" | "suspected";
  area: "storefront" | "admin" | "services" | "platform";
  title: string;
  where: string;
  steps?: string;
  expected?: string;
  actual: string;
  evidence: string;
  suggestedFix?: string;
}
export function finding(f: Finding) {
  appendFileSync(path.join(here, "topup_admin.jsonl"), JSON.stringify(f) + "\n");
  console.log(`!! ${f.id} [${f.severity}] ${f.title}`);
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}
export async function newCtx(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", ...opts });
  await isolateHmr(ctx);
  return ctx;
}
export type P = Page & { __errors: string[]; __bad: string[] };
export async function newPage(ctx: BrowserContext): Promise<P> {
  const page = (await ctx.newPage()) as P;
  page.__errors = [];
  page.__bad = [];
  page.on("pageerror", (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") page.__errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) page.__bad.push(`${r.status()} ${r.url()}`);
  });
  return page;
}

/** Signs an admin user in and caches the storage state in qa/bughunt/topup_admin-state-<name>.json. */
export async function stateFor(browser: Browser, name: string, email: string, password: string, force = false): Promise<any> {
  const f = path.join(here, `topup_admin-state-${name}.json`);
  if (!force && existsSync(f)) {
    const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(f, "utf8")) });
    const page = await ctx.newPage();
    const r = await page.goto(`${ADMIN}/t/${SLUG}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const ok = !page.url().includes("/login") && (r?.status() ?? 500) < 400;
    await ctx.close();
    if (ok) return JSON.parse(readFileSync(f, "utf8"));
  }
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  const state = await ctx.storageState();
  await ctx.close();
  writeFileSync(f, JSON.stringify(state));
  return state;
}

export const toast = (page: Page, re: RegExp, timeout = 30_000) => expect(page.locator("[data-sonner-toast]").filter({ hasText: re }).first()).toBeVisible({ timeout });
export async function anyToast(page: Page, timeout = 30_000): Promise<string> {
  const t = page.locator("[data-sonner-toast]").last();
  await expect(t).toBeVisible({ timeout });
  return (await t.innerText()).replace(/\s+/g, " ").trim();
}

export async function shot(page: Page, name: string, fullPage = true) {
  const f = shotPath(name);
  await page.screenshot({ path: f, animations: "disabled", fullPage });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize()?.width ?? 0;
  console.log(`  shot ${f}${scrollW > vw ? `  ⚠ horizontal overflow ${scrollW}px > ${vw}px` : ""}`);
  return { f, overflow: scrollW - vw };
}

/* ── storefront customer helpers (dev OTP) ──────────────────────────────────────────── */
export async function otpLogin(page: Page, phone: string, name: string, next = "/wallet") {
  await page.goto(`${STORE}/account/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByLabel("เบอร์โทรศัพท์").fill(phone);
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const code = (await page.getByText(/รหัสของคุณคือ/).locator("span").textContent({ timeout: 60_000 }))?.trim() ?? "";
  if (!/^\d{6}$/.test(code)) throw new Error(`dev OTP code not shown (got "${code}")`);
  await page.locator("#otp-code").fill(code);
  const nameBox = page.locator("#otp-name");
  if (await nameBox.count()) await nameBox.fill(name);
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(next), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
}
export async function placeOrder(page: Page, uid: string, pkg: RegExp, method: "กระเป๋าเงินในเว็บ" | "PromptPay QR" | "โอนเงิน"): Promise<string> {
  await page.goto(`${STORE}/games/rov`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("#pf-uid").fill(uid);
  await page.getByRole("radio", { name: pkg }).click();
  const l = page.locator("label").filter({ hasText: method }).first();
  await l.click();
  const btn = page.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
  await expect(btn).toBeEnabled({ timeout: 15_000 });
  await btn.click();
  await page.waitForURL(/\/topup\/TP-\d+/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname.split("/").pop()!;
}

/* ── server actions by id (Next-Action header) ──────────────────────────────────────── */
export function actionIds(): Array<[string, string, string]> {
  const f = path.join(here, "topup_admin-actionids.txt");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split(" ") as [string, string, string]);
}
export function actionId(name: string, file: string): string | undefined {
  return actionIds().find(([, n, f]) => n === name && (f ?? "").includes(file))?.[0];
}
export async function callAction(page: Page, pathname: string, id: string, args: unknown[]): Promise<{ status: number; text: string }> {
  return page.evaluate(
    async ({ url, id, body }) => {
      const r = await fetch(url, { method: "POST", headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body });
      return { status: r.status, text: (await r.text()).slice(0, 400000) };
    },
    { url: pathname, id, body: JSON.stringify(args) },
  );
}
export { chromium, expect, type Browser, type BrowserContext, type Page };
