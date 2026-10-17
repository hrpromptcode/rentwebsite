import "../../load-env";
import http from "node:http";
import path from "node:path";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { eq, getAdminDb, getDb, tenants, withPlatform, withTenant, type Tx } from "@rentweb/db";
import { isolateHmr } from "./fixes/_dev-stable";

export const ADMIN = "http://localhost:3001";
export const here = path.resolve(process.cwd(), "qa", "bughunt");
export const shot = (name: string) => path.resolve(process.cwd(), "screenshots", `bughunt-admin_b2-${name}.png`);
export const store = (slug: string) => `http://${slug}.localhost:3000`;
// reverify-repro: ADMIN_B2_CREDS / ADMIN_B2_STATE_OWNER let a re-run onboard fresh tenants without clobbering the hunt's files
export const CREDS = process.env.ADMIN_B2_CREDS ? path.resolve(process.env.ADMIN_B2_CREDS) : path.join(here, "admin_b2-creds.json");
export const OWNER_STATE = process.env.ADMIN_B2_STATE_OWNER ? path.resolve(process.env.ADMIN_B2_STATE_OWNER) : path.join(here, "admin_b2-state-owner.json");
export function readCreds(): Record<string, any> { return existsSync(CREDS) ? JSON.parse(readFileSync(CREDS, "utf8")) : {}; }
export function writeCreds(patch: Record<string, unknown>) { writeFileSync(CREDS, JSON.stringify({ ...readCreds(), ...patch }, null, 2)); }

export function out(label: string, v: unknown) { console.log(`## ${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`); }

export function hreq(host: string, p: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 3000, path: p, method: opts.method ?? "GET", headers: { host, accept: "text/html", ...(opts.headers ?? {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.setTimeout(120_000, () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}
/** GET a storefront path, retrying on 500 / compile errors (other agents edit files concurrently). */
export async function sget(slug: string, p: string) {
  let r = await hreq(`${slug}.localhost:3000`, p);
  for (let i = 0; i < 2 && (r.status >= 500 || /Failed to compile|Module not found/.test(r.body)); i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    r = await hreq(`${slug}.localhost:3000`, p);
  }
  return r;
}

export const db = () => getDb();
export async function tenantIdOf(slug: string): Promise<string> {
  const rows = await withPlatform(getAdminDb(), (tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1));
  if (!rows[0]) throw new Error("no tenant " + slug);
  return rows[0].id;
}
export function tt<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> { return withTenant(getDb(), tenantId, fn); }
export function plat<T>(fn: (tx: Tx) => Promise<T>): Promise<T> { return withPlatform(getAdminDb(), fn); }
export async function done() {
  await (getDb() as any).$client?.end?.({ timeout: 2 });
  await (getAdminDb() as any).$client?.end?.({ timeout: 2 });
}

export async function launch(): Promise<Browser> { return chromium.launch({ headless: true }); }

export async function newCtx(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await isolateHmr(ctx); // reverify-repro: drop only HMR reload frames instead of aborting the socket (keeps hydration)
  await ctx.addInitScript({ content: "window.__name = window.__name || ((f) => f);" });
  return ctx;
}
export type P = Page & { __errors: string[] };
export async function newPage(ctx: BrowserContext): Promise<P> {
  const page = (await ctx.newPage()) as P;
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(120_000);
  page.__errors = [];
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.on("pageerror", (e) => page.__errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error") page.__errors.push(`console: ${m.text().slice(0, 200)}`); });
  return page;
}
/** goto with retry when dev server shows a compile error / 500 */
export async function go(page: Page, url: string): Promise<number> {
  const full = url.startsWith("http") ? url : `${ADMIN}${url}`;
  let status = 0;
  for (let i = 0; i < 3; i++) {
    const res = await page.goto(full, { waitUntil: "networkidle" }).catch(() => null);
    status = res?.status() ?? 0;
    const body = await page.locator("body").innerText().catch(() => "");
    if (status < 500 && status !== 0 && !/Failed to compile|Build Error|Module not found|Unhandled Runtime Error/.test(body)) return status;
    await page.waitForTimeout(10_000);
  }
  return status;
}

export async function stateFor(browser: Browser, name: string, email: string, password: string): Promise<any> {
  const f = path.join(here, `admin_b2-state-${name}.json`);
  if (existsSync(f)) {
    const st = JSON.parse(readFileSync(f, "utf8"));
    const ctx = await newCtx(browser, { storageState: st });
    const p = await ctx.newPage();
    await p.goto(`${ADMIN}/`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => null);
    const ok = !p.url().includes("/login");
    await ctx.close();
    if (ok) return st;
  }
  const ctx = await newCtx(browser);
  const page = await newPage(ctx);
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  const st = await ctx.storageState();
  writeFileSync(f, JSON.stringify(st));
  await ctx.close();
  return st;
}
export const adminState = (b: Browser) => stateFor(b, "admin", "admin@rentweb.local", "Admin1234!");

export async function toast(page: Page, re: RegExp, action?: () => Promise<unknown>, timeout = 90_000): Promise<string> {
  const before = await page.locator("[data-sonner-toast]").filter({ hasText: re }).count();
  if (action) await action();
  try {
    await page.waitForFunction(({ before, src }) => Array.from(document.querySelectorAll("[data-sonner-toast]")).filter((t) => new RegExp(src).test(t.textContent ?? "")).length > before, { before, src: re.source }, { timeout });
  } catch {
    const any = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    throw new Error(`toast ${re} not shown; seen ${JSON.stringify(any).slice(0, 300)}`);
  }
  return (await page.locator("[data-sonner-toast]").filter({ hasText: re }).last().innerText()).replace(/\s+/g, " ");
}
export async function anyToast(page: Page, action: () => Promise<unknown>, timeout = 60_000): Promise<string> {
  const before = await page.locator("[data-sonner-toast]").count();
  await action();
  await page.waitForFunction((b) => document.querySelectorAll("[data-sonner-toast]").length > b, before, { timeout }).catch(() => {});
  const all = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  return (all[all.length - 1] ?? "(no toast)").replace(/\s+/g, " ");
}

export function finding(f: Record<string, unknown>) { appendFileSync(path.join(here, "admin_b2.jsonl"), JSON.stringify(f) + "\n"); }
export const rand = () => Math.random().toString(36).slice(2, 6);
export { chromium, type Browser, type BrowserContext, type Page };
