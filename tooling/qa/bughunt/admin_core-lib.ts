import "../../load-env";
import http from "node:http";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const ADMIN = "http://localhost:3001";
export const SHOTS = path.resolve(process.cwd(), "screenshots");
export const CREDS_FILE = path.resolve(process.cwd(), "qa/bughunt/admin_core-creds.json");

export function readCreds(): Record<string, unknown> {
  return existsSync(CREDS_FILE) ? JSON.parse(readFileSync(CREDS_FILE, "utf8")) : {};
}
export function writeCreds(patch: Record<string, unknown>) {
  writeFileSync(CREDS_FILE, JSON.stringify({ ...readCreds(), ...patch }, null, 2));
}

export function fetchTenant(host: string, pathname = "/", opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path: pathname, method: opts.method ?? "GET", headers: { Host: host, Accept: "text/html", ...(opts.headers ?? {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    req.setTimeout(120_000, () => req.destroy(new Error("storefront timeout")));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export async function waitFor(fn: () => Promise<boolean>, timeoutMs = 90_000, every = 2000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, every));
  }
  return -1;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function newPage(ctx: BrowserContext): Promise<Page & { __errors: string[] }> {
  const page = (await ctx.newPage()) as Page & { __errors: string[] };
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(120_000);
  page.__errors = [];
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.on("pageerror", (e) => page.__errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") page.__errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  return page;
}

export async function goto(page: Page, url: string) {
  const res = await page.goto(url.startsWith("http") ? url : `${ADMIN}${url}`, { waitUntil: "networkidle" });
  return res?.status() ?? 0;
}

export async function login(page: Page, email: string, password: string) {
  await goto(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.waitForLoadState("networkidle");
}

export async function signup(page: Page, name: string, email: string, password: string) {
  await goto(page, "/signup");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => u.pathname.startsWith("/onboarding"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.waitForLoadState("networkidle");
}

/** waits for a NEW sonner toast matching re after running action; returns its text */
export async function toast(page: Page, re: RegExp, action?: () => Promise<unknown>, timeout = 120_000): Promise<string> {
  const before = await page.locator("[data-sonner-toast]").filter({ hasText: re }).count();
  if (action) await action();
  try {
    await page.waitForFunction(
      ({ before, src }) => Array.from(document.querySelectorAll("[data-sonner-toast]")).filter((t) => new RegExp(src).test(t.textContent ?? "")).length > before,
      { before, src: re.source },
      { timeout },
    );
  } catch {
    const any = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    throw new Error(`toast ${re} not shown; seen ${JSON.stringify(any).slice(0, 300)}`);
  }
  return (await page.locator("[data-sonner-toast]").filter({ hasText: re }).last().innerText()).replace(/\s+/g, " ");
}

export async function lastToasts(page: Page): Promise<string[]> {
  return (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " "));
}

export function out(label: string, v: unknown) {
  console.log(`## ${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
}
