import "../../load-env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, eq, getAdminDb, rentalStays, rentalUnitTypes, tenants } from "@rentweb/db";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Rental (hotel) redesign screenshots (phase 2, rental agent).
 *   pnpm exec tsx qa/redesign/rental-shots.ts [--only=home,rooms] [--w=1440,390] [--reduce] [--top] [--frames] [--dark]
 * → tooling/screenshots/redesign-rental-<name>[-reduce][-dark]-<w>.png (full page; --top = first viewport; --frames = contact sheet)
 * Prints status, console errors / hydration warnings, horizontal overflow and scene statuses per page.
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const ONLY = args.only ? args.only.split(",") : null;
const WIDTHS = (args.w ?? "1440,390").split(",").map(Number);
const REDUCE = !!args.reduce;
const TOP = !!args.top;
const FRAMES = !!args.frames;
const DARK = !!args.dark;
const SHOTS = path.resolve(process.cwd(), "screenshots");
const SLUG = "demo-hotel";
const ORIGIN = `http://${SLUG}.localhost:3000`;

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function settle(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
}

async function login(ctx: BrowserContext, phone: string) {
  const page = await ctx.newPage();
  try {
    await stableGoto(page, `${ORIGIN}/account/login?next=%2Faccount`, "load");
    await page.fill("#otp-target", phone);
    await page.locator('form button[type="submit"]').click();
    await page.locator("#otp-code").waitFor({ timeout: 60_000 });
    const code = (await page.evaluate(() => document.body.innerText)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    if (!code) throw new Error("no dev OTP");
    await page.fill("#otp-code", code);
    if (await page.locator("#otp-name").isVisible().catch(() => false)) await page.fill("#otp-name", "พลอย ชนากานต์");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const db = getAdminDb();
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  if (!tenant) throw new Error("demo-hotel missing");
  const types = await db.select({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug }).from(rentalUnitTypes).where(eq(rentalUnitTypes.tenantId, tenant.id));
  const stays = await db
    .select({ id: rentalStays.id, status: rentalStays.status, key: rentalStays.accessKey, phone: rentalStays.guestPhone })
    .from(rentalStays)
    .where(and(eq(rentalStays.tenantId, tenant.id)))
    .orderBy(asc(rentalStays.createdAt));
  const byStatus = (s: string) => stays.find((x) => x.status === s);
  const today = bkkToday();
  const F = addDays(today, 45);
  const T = addDays(today, 47);
  const routes: Array<[string, string]> = [
    ["home", "/"],
    ["rooms", "/rooms"],
    ["rooms-q", `/rooms?from=${F}&to=${T}&guests=2`],
    ["room", `/rooms/beachfront-pool-villa`],
    ["room-q", `/rooms/family-villa?from=${F}&to=${T}&guests=4`],
    ["stay", "/stay"],
    ["stay-results", `/stay?from=${F}&to=${T}&guests=2`],
    ["stay-none", `/stay?from=${F}&to=${T}&guests=12`],
    ["book", `/stay/book?type=deluxe-seaview&from=${F}&to=${T}&guests=2`],
    ["book-bad", `/stay/book?type=deluxe-seaview&from=${F}&to=${addDays(F, 40)}&guests=2`],
  ];
  for (const st of ["pending", "confirmed", "checked_out", "cancelled"]) {
    const s = byStatus(st);
    if (s) routes.push([`stays-${st}`, `/stays/${s.id}?k=${encodeURIComponent(s.key)}`]);
  }
  if (stays[0]) routes.push(["stays-denied", `/stays/${stays[0].id}`]);
  routes.push(["account-stays", "/account/stays"], ["account-stays-past", "/account/stays?scope=past"]);
  void types;

  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: REDUCE ? "reduce" : "no-preference", colorScheme: DARK ? "dark" : "light", isMobile: w < 768, hasTouch: w < 768 });
    await isolateHmr(ctx);
    let loggedIn = false;
    for (const [name, route] of routes) {
      if (ONLY && !ONLY.includes(name)) continue;
      if (name.startsWith("account") && !loggedIn) {
        const phone = byStatus("confirmed")?.phone ?? "0813330001";
        await login(ctx, phone).catch((e) => console.log(`login failed: ${(e as Error).message.split("\n")[0]}`));
        loggedIn = true;
      }
      const page = await ctx.newPage();
      const errs: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || /hydrat/i.test(m.text())) errs.push(m.text().slice(0, 220));
      });
      page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 220)}`));
      try {
        if (DARK) await page.addInitScript(() => localStorage.setItem("rw-mode", "dark"));
        const res = await stableGoto(page, `${ORIGIN}${route}`, "load");
        await page.waitForTimeout(1200);
        if (!TOP) await settle(page);
        else await page.waitForTimeout(2200);
        const info = await page.evaluate(() => ({
          ov: document.documentElement.scrollWidth - window.innerWidth,
          canv: [...document.querySelectorAll("[data-scene-status]")].map((e) => (e as HTMLElement).dataset.sceneStatus).join(","),
          live: document.querySelectorAll("canvas").length,
        }));
        const file = path.join(SHOTS, `redesign-rental-${name}${REDUCE ? "-reduce" : ""}${DARK ? "-dark" : ""}-${w}.png`);
        if (FRAMES) {
          const vh = page.viewportSize()!.height;
          const total = await page.evaluate(() => document.documentElement.scrollHeight);
          const shots: string[] = [];
          for (let y = 0; y < total - 40 && shots.length < 24; y += Math.round(vh * 0.85)) {
            await page.evaluate((yy) => window.scrollTo(0, yy), y);
            await page.waitForTimeout(1000);
            shots.push((await page.screenshot({ type: "jpeg", quality: 70 })).toString("base64"));
          }
          const cols = w < 768 ? 6 : 3;
          const sheet = await ctx.newPage();
          await sheet.setViewportSize({ width: 1800, height: 900 });
          await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${shots.map((b, i) => `<figure style="margin:0;color:#aaa;font:11px monospace"><img style="width:100%;display:block" src="data:image/jpeg;base64,${b}">f${String(i).padStart(2, "0")}</figure>`).join("")}</body>`, { waitUntil: "load" });
          await sheet.screenshot({ path: file, fullPage: true });
          await sheet.close();
        } else await page.screenshot({ path: file, fullPage: !TOP });
        console.log(`${res?.status()} ${name} ${w}: overflow=${info.ov}px scenes=[${info.canv}] canvases=${info.live} errors=${errs.length}${errs.length ? `\n   ${[...new Set(errs)].slice(0, 6).join("\n   ")}` : ""}`);
      } catch (e) {
        console.log(`FAIL ${name} ${w}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await page.close();
      }
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
