import "../../load-env";
import path from "node:path";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const ADMIN = "http://localhost:3001";
export const store = (key: string) => `http://demo-${key}.localhost:3000`;
export const here = path.resolve(process.cwd(), "qa", "bughunt");
export const shotsDir = path.resolve(process.cwd(), "screenshots");
export const shot = (name: string) => path.join(shotsDir, `bughunt-admin_modules-${name}.png`);

export async function loginState(browser: Browser, email = "admin@rentweb.local", password = "Admin1234!", cacheName = "admin") {
  const f = path.join(here, `admin_modules-state-${cacheName}.json`);
  if (existsSync(f)) {
    const st = JSON.parse(readFileSync(f, "utf8"));
    // validate
    const ctx = await browser.newContext({ storageState: st });
    const p = await ctx.newPage();
    const r = await p.goto(`${ADMIN}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const ok = !p.url().includes("/login");
    await ctx.close();
    if (ok && r) return st;
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  const st = await ctx.storageState();
  writeFileSync(f, JSON.stringify(st));
  await ctx.close();
  return st;
}

export function finding(f: Record<string, unknown>) {
  appendFileSync(path.join(here, "admin_modules.jsonl"), JSON.stringify(f) + "\n");
}

export function collectErrors(page: Page, bag: string[]) {
  page.on("pageerror", (e) => bag.push(`pageerror ${page.url()} ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error") bag.push(`console ${page.url()} ${m.text().slice(0, 200)}`); });
}

export { chromium, type Browser, type BrowserContext, type Page };

/** tsx/esbuild keepNames injects __name() into functions passed to page.evaluate */
export async function fixName(ctx: BrowserContext) {
  await ctx.addInitScript({ content: "window.__name = window.__name || ((f) => f);" });
}
