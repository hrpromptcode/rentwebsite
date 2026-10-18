import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, bookings, desc, eq, getAdminDb, inArray, rentalStays, services, tenants } from "@rentweb/db";
import { getTenantRuntime } from "@rentweb/core/tenant";
import { bookingConfig, listTimetable } from "@rentweb/module-booking/services";
import { addDays, bkkDateString } from "@rentweb/module-rental/time";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Human-eye screenshot pass for wave A (QA packet qa_wave_a): demo-course + demo-hotel storefront main pages and the
 * admin pages, 1440 and 390, MOTION ON (the page is scrolled to the bottom first so every Reveal has played), full page.
 * Also records horizontal overflow and small tap targets (< 44px) at 390 and console errors per page.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/wave-a-shots.ts [--only=hotel-home,course-schedule]
 * → tooling/screenshots/qa-a-*.png + tooling/qa/wave-a-shots-report.md (…-partial.md with --only)
 * "clipped" = elements whose right edge lies beyond the viewport even though the document does not scroll
 * (an overflow-x:hidden ancestor hides them – the hotel book form was cut this way at 390).
 */
const ONLY = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? "").split(",").filter(Boolean));

const PORT = process.env.PORT ?? "3000";
const ADMIN = `http://localhost:${process.env.ADMIN_PORT ?? "3001"}`;
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const SHOTS = path.resolve(process.cwd(), "screenshots");
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

interface Shot {
  name: string;
  url: string;
  viewport: keyof typeof VIEWPORTS;
  file: string;
  status: number | null;
  overflow: number;
  clipped: string[];
  smallTargets: string[];
  consoleErrors: string[];
  placeholders: string[];
}
const report: Shot[] = [];

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.7));
    let y = 0;
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    while (y < max()) {
      y = Math.min(y + step, max());
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 140));
    }
    await new Promise((r) => setTimeout(r, 400));
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    for (let i = 0; i < 20 && window.scrollY > 0; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 600));
  });
}

async function inspect(page: Page) {
  return page.evaluate(() => {
    const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const vw = window.innerWidth;
    const clipped: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // decorative bleeds (-inset-*, -z-*) and horizontally scrollable strips / grids are expected to extend past the edge
      if (el.closest("[aria-hidden='true'], [data-hero-dark], [class*='overflow-x-auto'], [class*='overflow-auto'], [class*='overflow-x-scroll'], [class*='marquee'], [class*='-inset-'], [class*='-z-']")) continue;
      clipped.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
      if (clipped.length >= 3) break;
    }
    const small: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]'));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === "hidden" || st.display === "none") continue;
      if (el.closest("[aria-hidden='true']")) continue;
      if (r.height < 40 || r.width < 40) {
        if (el.closest("nav") && el.tagName === "A" && r.height >= 32) continue; // dense nav links are debatable – list the rest
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
        small.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const text = document.body.innerText;
    const placeholders: string[] = [];
    for (const p of ["lorem", "Lorem", "ยังไม่มีคอมโพเนนต์", "undefined", "NaN", "[object Object]", "TODO", "placeholder"]) if (text.includes(p)) placeholders.push(p);
    return { overflow, clipped, small: [...new Set(small)].slice(0, 12), placeholders };
  });
}

async function shoot(ctx: BrowserContext, name: string, url: string, viewport: keyof typeof VIEWPORTS, opts: { full?: boolean } = {}) {
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
  let status: number | null = null;
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    status = res?.status() ?? null;
    await page.waitForTimeout(600);
    await autoScroll(page);
    const info = await inspect(page);
    const file = path.join(SHOTS, `qa-a-${name}-${viewport === "desktop" ? "1440" : "390"}.png`);
    await page.screenshot({ path: file, fullPage: opts.full !== false });
    report.push({ name, url, viewport, file, status, overflow: info.overflow, clipped: info.clipped, smallTargets: info.small, consoleErrors: consoleErrors.filter((e) => !/Reduced Motion|Download the React DevTools|hydration/i.test(e)), placeholders: info.placeholders });
    console.log(`${status} ${viewport.padEnd(7)} ${name.padEnd(28)} overflow=${info.overflow} clipped=${info.clipped.length} small=${info.small.length} errors=${consoleErrors.length}`);
  } catch (e) {
    report.push({ name, url, viewport, file: "", status, overflow: -1, clipped: [], smallTargets: [], consoleErrors: [String((e as Error).message).slice(0, 200)], placeholders: [] });
    console.log(`ERR  ${viewport} ${name}: ${String((e as Error).message).slice(0, 200)}`);
  } finally {
    await page.close();
  }
}

async function context(browser: Browser, viewport: keyof typeof VIEWPORTS, storageState?: string) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "no-preference", storageState });
  await isolateHmr(ctx);
  // tsx (esbuild keepNames) wraps inner arrow functions of page.evaluate callbacks in __name(); define it in the page
  await ctx.addInitScript("window.__name = window.__name || ((f) => f);");
  return ctx;
}

async function adminLogin(browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  const file = path.join(SHOTS, "qa-a-admin-state.json");
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const db = getAdminDb();
  const [course] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-course")).limit(1);
  const [hotel] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-hotel")).limit(1);
  if (!course || !hotel) throw new Error("demo-course / demo-hotel missing");

  // course: next open hatha-basic session, a booking with an access key, the class service id
  const runtime = await getTenantRuntime(course.id);
  const [hatha] = await db.select({ id: services.id }).from(services).where(and(eq(services.tenantId, course.id), eq(services.slug, "hatha-basic"))).limit(1);
  const tt = await (await import("@rentweb/db")).withTenant((await import("@rentweb/db")).getDb(), course.id, (tx) => listTimetable(tx, course.id, { from: bkkDateString(), days: 14, config: bookingConfig(runtime!.config.moduleConfig), serviceId: hatha?.id }));
  const session = tt.find((s) => s.state === "open");
  const recent = await db.select({ id: bookings.id, answers: bookings.answers, status: bookings.status }).from(bookings).where(and(eq(bookings.tenantId, course.id), inArray(bookings.status, ["pending", "confirmed", "completed"]))).orderBy(desc(bookings.createdAt)).limit(20);
  const withKey = recent.find((b) => (b.answers as { accessKey?: string } | null)?.accessKey);
  // hotel: a confirmed stay with its key
  const [stay] = await db.select({ id: rentalStays.id, key: rentalStays.accessKey, status: rentalStays.status }).from(rentalStays).where(and(eq(rentalStays.tenantId, hotel.id), inArray(rentalStays.status, ["confirmed", "checked_in"]))).orderBy(desc(rentalStays.createdAt)).limit(1);
  const from = addDays(bkkDateString(), 35);

  const C = `http://demo-course.localhost:${PORT}`;
  const H = `http://demo-hotel.localhost:${PORT}`;
  const storefront: Array<[string, string]> = [
    ["course-home", `${C}/`],
    ["course-classes", `${C}/classes`],
    ["course-class-detail", `${C}/classes/hatha-basic`],
    ["course-schedule", `${C}/schedule`],
    ["course-book-widget", session ? `${C}/book?service=hatha-basic&date=${session.date}&start=${encodeURIComponent(session.start)}` : `${C}/book?service=hatha-basic`],
    ["course-confirmation", withKey ? `${C}/bookings/${withKey.id}?k=${encodeURIComponent((withKey.answers as { accessKey: string }).accessKey)}` : `${C}/account/bookings`],
    ["hotel-home", `${H}/`],
    ["hotel-rooms", `${H}/rooms`],
    ["hotel-room-detail", `${H}/rooms/deluxe-seaview`],
    ["hotel-book-widget", `${H}/stay/book?type=deluxe-seaview&from=${from}&to=${addDays(from, 2)}&guests=2`],
    ["hotel-confirmation", stay ? `${H}/stays/${stay.id}?k=${encodeURIComponent(stay.key)}` : `${H}/account/stays`],
    ["hotel-stay-search", `${H}/stay?from=${from}&to=${addDays(from, 2)}&guests=2`],
  ];
  const admin: Array<[string, string]> = [
    ["admin-hotel-bookings", `${ADMIN}/t/demo-hotel/rental/bookings`],
    ["admin-hotel-calendar", `${ADMIN}/t/demo-hotel/rental/calendar`],
    ["admin-hotel-units", `${ADMIN}/t/demo-hotel/rental/units`],
    ["admin-course-bookings", `${ADMIN}/t/demo-course/bookings`],
    ["admin-course-class", hatha ? `${ADMIN}/t/demo-course/services/${hatha.id}` : `${ADMIN}/t/demo-course/services`],
  ];

  const browser = await chromium.launch();
  try {
    for (const vp of ["desktop", "mobile"] as const) {
      const ctx = await context(browser, vp);
      for (const [name, url] of storefront) if (!ONLY.size || ONLY.has(name)) await shoot(ctx, name, url, vp);
      await ctx.close();
    }
    const state = await adminLogin(browser);
    for (const vp of ["desktop", "mobile"] as const) {
      const ctx = await context(browser, vp, state);
      for (const [name, url] of admin) if (!ONLY.size || ONLY.has(name)) await shoot(ctx, name, url, vp);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const md = [
    `# Wave-A screenshot pass — ${new Date().toISOString()} (motion on, full page)`,
    "",
    "| Page | VP | HTTP | overflow px | clipped (beyond viewport) | small targets (<40px) | console errors | placeholders |",
    "|---|---|---|---|---|---|---|---|",
    ...report.map((r) => `| ${r.name} | ${r.viewport} | ${r.status ?? "-"} | ${r.overflow} | ${r.clipped.length ? r.clipped.join("<br>") : "-"} | ${r.smallTargets.length ? r.smallTargets.join("<br>") : "-"} | ${r.consoleErrors.length ? r.consoleErrors.join("<br>") : "-"} | ${r.placeholders.join(", ") || "-"} |`),
    "",
    "Files: tooling/screenshots/qa-a-<page>-{1440,390}.png",
  ].join("\n");
  const reportName = ONLY.size ? "wave-a-shots-report-partial.md" : "wave-a-shots-report.md";
  await writeFile(path.resolve(process.cwd(), "qa", reportName), md, "utf8");
  console.log(`\nwrote qa/${reportName} (${report.length} shots)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
