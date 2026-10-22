/**
 * events agent verification (phase 2 hi-end redesign): screenshots of every events route on demo-events at 1440 + 390,
 * console / hydration errors, horizontal overflow, live WebGL canvases per viewport.
 *   cd tooling && pnpm exec tsx qa/redesign/events-shots.ts [--only=home,events,event,…] [--w=1440,390] [--reduce]
 *        [--frames=8] [--full] [--tag=x]
 * Orders come from the seeded demo data (paid / pending / cancelled / refunded) → no journey run needed.
 * → screenshots/redesign-events-<page>-<w>[-reduce][-tag].png  (contact sheet of viewport frames, f00 = first viewport)
 */
import "../../load-env";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, customers, desc, eq, getAdminDb, isNotNull, ticketOrders, tickets, tenants } from "@rentweb/db";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = new Set((arg("only") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const REDUCE = process.argv.includes("--reduce");
const FULL = process.argv.includes("--full");
const MAX_FRAMES = Number(arg("frames") ?? 8);
const WAIT = Number(arg("wait") ?? 1800);
const TAG = arg("tag") ? `-${arg("tag")}` : "";
const BASE = "http://demo-events.localhost:3000";
const OUT = path.resolve(process.cwd(), "screenshots");
let ownerPhone: string | null = null;
let authState: Awaited<ReturnType<BrowserContext["storageState"]>> | null = null;
const testPhone = () => `086${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function orders() {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-events")).limit(1);
  if (!t) throw new Error("demo-events missing");
  const rows = await db.select({ id: ticketOrders.id, status: ticketOrders.status, k: ticketOrders.accessKey, total: ticketOrders.total }).from(ticketOrders).where(eq(ticketOrders.tenantId, t.id)).orderBy(desc(ticketOrders.createdAt)).limit(200);
  const pick = (s: string, f?: (r: (typeof rows)[number]) => boolean) => rows.find((r) => r.status === s && (!f || f(r)));
  const paid = pick("paid");
  const [tk] = paid ? await db.select({ code: tickets.code }).from(tickets).where(and(eq(tickets.tenantId, t.id), eq(tickets.orderId, paid.id))).limit(1) : [];
  // a seeded customer who owns orders → the account pages show real rows
  const [owner] = await db.select({ phone: customers.phone }).from(ticketOrders).innerJoin(customers, eq(customers.id, ticketOrders.customerId)).where(and(eq(ticketOrders.tenantId, t.id), isNotNull(ticketOrders.customerId), eq(ticketOrders.status, "paid"))).limit(1);
  ownerPhone = owner?.phone ? owner.phone.replace(/^\+66/, "0").replace(/\D/g, "") : null;
  console.log("owner phone", ownerPhone);
  return { paid, pending: pick("pending", (r) => r.total > 0), cancelled: pick("cancelled"), refunded: pick("refunded"), code: tk?.code ?? null };
}

async function shoot(browser: Browser, w: number, pages: Array<{ name: string; path: string; login?: boolean }>) {
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: REDUCE ? "reduce" : "no-preference", ...(authState ? { storageState: authState } : {}) });
  await isolateHmr(ctx);
  let loggedIn = !!authState;
  const summary: string[] = [];
  for (const pg of pages) {
    if (pg.login && !loggedIn) {
      const p = await ctx.newPage();
      await stableGoto(p, `${BASE}/account/login?next=%2Faccount`);
      await p.fill("#otp-target", ownerPhone ?? testPhone());
      await p.locator('form button[type="submit"]').click();
      await p.locator("#otp-code").waitFor({ timeout: 60_000 });
      const code = (await p.evaluate(() => document.body.innerText)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1] ?? "";
      await p.fill("#otp-code", code);
      if (await p.locator("#otp-name").isVisible().catch(() => false)) await p.fill("#otp-name", "ทดสอบ ดีไซน์");
      await p.locator('form button[type="submit"]').click();
      await p.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
      await p.close();
      loggedIn = true;
      authState = await ctx.storageState();
    }
    const page: Page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat/i.test(m.text())) errs.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
    const res = await stableGoto(page, BASE + pg.path).catch((e) => {
      errs.push(`goto: ${String(e).slice(0, 120)}`);
      return null;
    });
    await page.waitForTimeout(WAIT);
    const suffix = `${w}${REDUCE ? "-reduce" : ""}${TAG}`;
    const files: string[] = [];
    const canv: number[] = [];
    if (FULL) {
      const f = path.join(OUT, `redesign-events-${pg.name}-${suffix}.png`);
      await page.screenshot({ path: f, fullPage: true });
    } else {
      const vh = page.viewportSize()!.height;
      for (let i = 0; i < MAX_FRAMES; i++) {
        const f = path.join(OUT, `.ev-${pg.name}-${suffix}-f${String(i).padStart(2, "0")}.png`);
        await page.waitForTimeout(i === 0 ? 300 : 900);
        await page.screenshot({ path: f });
        files.push(f);
        canv.push(await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.width > 0; }).length).catch(() => -1));
        const before = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, vh * 0.85);
        await page.waitForTimeout(250);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), before + vh * 0.85);
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => window.scrollY);
        if (after <= before + 4) break;
      }
      const cols = w < 768 ? Math.min(files.length, 5) : Math.min(files.length, 3);
      const cells = files.map((f, i) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>f${i} · canvases ${canv[i]}</figcaption></figure>`).join("");
      const html = `<!doctype html><html><body style="margin:0;background:#1a1a1a;color:#ccc;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
      const tmp = path.join(OUT, `.ev-sheet-${Date.now()}.html`);
      fs.writeFileSync(tmp, html);
      const sp = await browser.newPage({ viewport: { width: w < 768 ? 1500 : 1800, height: 900 } });
      await sp.goto(pathToFileURL(tmp).href);
      await sp.waitForLoadState("load");
      await sp.screenshot({ path: path.join(OUT, `redesign-events-${pg.name}-${suffix}.png`), fullPage: true });
      await sp.close();
      fs.unlinkSync(tmp);
      if (!process.argv.includes("--keep")) files.slice(1).forEach((f) => fs.unlinkSync(f));
      if (files[0]) fs.renameSync(files[0], path.join(OUT, `redesign-events-${pg.name}-${suffix}-top.png`));
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => -1);
    const line = `${pg.name.padEnd(16)} ${w} status=${res?.status() ?? "?"} overflow=${overflow}px canvases/viewport=${canv.join(",") || "-"} errors=${errs.length}${errs.length ? `\n    ${[...new Set(errs)].slice(0, 6).join("\n    ")}` : ""}`;
    console.log(line);
    summary.push(line);
    await page.close();
  }
  await ctx.close();
  return summary;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const o = await orders();
  const k = (r?: { id: string; k: string }) => (r ? `/tickets/${r.id}?k=${encodeURIComponent(r.k)}` : null);
  const all: Array<{ name: string; path: string | null; login?: boolean }> = [
    { name: "home", path: "/" },
    { name: "venue", path: "/venue" },
    { name: "about", path: "/about" },
    { name: "contact", path: "/contact" },
    { name: "events", path: "/events" },
    { name: "events-past", path: "/events?scope=past" },
    { name: "events-empty", path: "/events?q=zzzzqqq" },
    { name: "event", path: "/events/riverside-live" },
    { name: "event-talk", path: "/events/design-talk-2026" },
    { name: "event-past", path: "/events/maker-market-7" },
    { name: "order-paid", path: k(o.paid) },
    { name: "order-pending", path: k(o.pending) },
    { name: "order-cancelled", path: k(o.cancelled) },
    { name: "order-refunded", path: k(o.refunded) },
    { name: "order-locked", path: o.paid ? `/tickets/${o.paid.id}` : null },
    { name: "ticket", path: o.code ? `/tickets/t/${o.code}` : null },
    { name: "account", path: "/account/tickets", login: true },
    { name: "account-past", path: "/account/tickets?scope=past", login: true },
  ];
  const pages = all.filter((p): p is { name: string; path: string; login?: boolean } => !!p.path && (!ONLY.size || ONLY.has(p.name)));
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const w of WIDTHS) await shoot(browser, w, pages);
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
