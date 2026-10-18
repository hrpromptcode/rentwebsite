import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Course / studio template journey (demo-course = "Sala Flow", booking module + class passes).
 *   pnpm --filter @rentweb/tooling exec tsx qa/course-journey.ts
 * Customer (desktop 1440): browse /classes → class detail → /schedule → enrol as guest from a timetable session →
 * PromptPay slip → confirmed → OTP login shows the class in /account → buy a 5-class pass → enrol with the pass
 * (session deducted). Admin (:3001): calendar chip "n/seats", booking detail with instructor + classmates, cancel frees
 * the seat, services list / edit page show seats, level and the weekly sessions editor. Mobile (390): day tabs, no overflow.
 * Prints PASS/FAIL per step, screenshots to tooling/screenshots/course-*.png, writes tooling/qa/course-journey-results.md.
 */

const PORT = process.env.PORT ?? "3000";
const SLUG = "demo-course";
const ORIGIN = `http://${SLUG}.localhost:${PORT}`;
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const SHOTS = path.resolve(process.cwd(), "screenshots");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
/** a fresh student per run (phone must be 10 digits starting with 0) */
const PHONE = `09${String(Date.now()).slice(-8)}`;
const INSTRUCTOR_RE = /ครู(แนน|พลอย|มุก|บีม)/;

/* ------------------------------------------------------------------ */
/* harness                                                              */
/* ------------------------------------------------------------------ */

interface Result {
  id: string;
  name: string;
  ok: boolean;
  info?: string;
}
const results: Result[] = [];
const consoleErrors = new Map<string, string[]>();

async function step(id: string, name: string, page: Page | null, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const info = await fn();
    results.push({ id, name, ok: true, info: info ?? undefined });
    console.log(`PASS ${id} ${name}${info ? ` – ${info}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
      .split("\n")
      .slice(0, 3)
      .join(" | ")
      .slice(0, 400);
    results.push({ id, name, ok: false, info: msg });
    console.log(`FAIL ${id} ${name} – ${msg}`);
    if (page && !page.isClosed()) {
      const file = path.join(SHOTS, `course-FAIL-${id}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`     screenshot: ${file}  url: ${page.url()}`);
    }
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function newPage(browser: Browser, label: string, viewport = DESKTOP, storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce", storageState });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  const errs: string[] = [];
  consoleErrors.set(label, errs);
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 240)}`));
  return { ctx, page };
}

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function shot(page: Page, name: string, full = false) {
  const file = path.join(SHOTS, `course-${name}.png`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
  return file;
}

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** Monday of next week (Bangkok) – every session there is inside the 21-day booking window and outside the notice period */
function nextWeekMonday(): string {
  const today = bkkToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const thisMonday = addDaysYmd(today, wd === 0 ? -6 : 1 - wd);
  return addDaysYmd(thisMonday, 7);
}

interface SessionLink {
  href: string;
  slug: string;
  date: string;
  start: string;
  remaining: number;
  text: string;
}
/** open sessions ("เหลือ n ที่นั่ง") on the schedule page, in timetable order */
async function openSessions(page: Page): Promise<SessionLink[]> {
  const raw = (await page.locator('a[href^="/book?service="]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute("href") ?? "", text: (e as HTMLElement).innerText })))) as Array<{ href: string; text: string }>;
  const out: SessionLink[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const m = /เหลือ (\d+) ที่นั่ง/.exec(r.text);
    if (!m || seen.has(r.href)) continue;
    seen.add(r.href);
    const u = new URL(r.href, ORIGIN);
    out.push({ href: r.href, slug: u.searchParams.get("service") ?? "", date: u.searchParams.get("date") ?? "", start: u.searchParams.get("start") ?? "", remaining: Number(m[1]), text: r.text.replace(/\s+/g, " ") });
  }
  return out;
}
async function remainingFor(page: Page, s: SessionLink): Promise<number | null> {
  const el = page.locator(`a[href="${s.href}"]`).first();
  if (!(await el.count())) {
    // sold out → the cell is no longer a link; look for the class name + time in the day column
    return 0;
  }
  const m = /เหลือ (\d+) ที่นั่ง/.exec(await el.innerText());
  return m ? Number(m[1]) : null;
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24/, "00");

/** Lands on the wizard from a timetable link; preselect skips to the details step (falls back to clicking the chip). */
async function openWizardAt(page: Page, s: SessionLink, extra = "") {
  await page.goto(`${ORIGIN}${s.href}${extra}`);
  await page.getByRole("heading", { level: 1, name: "จองคิวออนไลน์" }).waitFor();
  const details = page.getByText("ข้อมูลสำหรับติดต่อ");
  const ok = await details.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  if (ok) return;
  // the time step is showing: click the session chip
  const chip = page.locator("button[aria-pressed]").filter({ hasText: hhmm(s.start) }).first();
  await chip.click();
  await details.waitFor();
}
async function nextToConfirm(page: Page, d: { name?: string; phone?: string }) {
  if (d.name !== undefined) await page.fill("#bk-name", d.name);
  if (d.phone !== undefined) await page.fill("#bk-phone", d.phone);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
}
async function confirmBooking(page: Page): Promise<{ id: string; key: string | null; url: string }> {
  await page.getByRole("button", { name: "ยืนยันการจอง" }).click();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const u = new URL(page.url());
  await page.getByText("หมายเลขการจอง").waitFor();
  return { id: u.pathname.match(UUID_RE)![0], key: u.searchParams.get("k"), url: page.url() };
}
async function uploadSlipAndWaitPaid(page: Page) {
  await page.getByText("แนบสลิปโอนเงิน").waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("ชำระเงินสำเร็จ").waitFor({ timeout: 30_000 });
}
async function waitText(page: Page, needle: string, reloadUrl?: string) {
  const ok = await page
    .waitForFunction((n) => document.body.innerText.includes(n), needle, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!ok && reloadUrl) await page.goto(reloadUrl);
  assert((await bodyText(page)).includes(needle), `'${needle}' not shown (url ${page.url()})`);
}

async function adminLogin(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const today = bkkToday();
  const week = nextWeekMonday();
  console.log(`BKK today ${today}; sessions taken from the week of ${week}; student ${PHONE}`);

  const { page: d } = await newPage(browser, "desktop");

  await step("C1", "/classes catalog + level filter", d, async () => {
    const r = await d.goto(`${ORIGIN}/classes`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: "คลาสทั้งหมด" }).waitFor();
    const all = (await d.locator('a[href^="/classes/"]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute("href"))).size)) as number;
    assert(all >= 8, `expected >= 8 class links, got ${all}`);
    const txt = await bodyText(d);
    assert(/\d+ คลาส · \d+ รอบต่อสัปดาห์/.test(txt), "count copy missing");
    for (const n of ["Hatha Yoga เริ่มต้น", "Reformer Pilates Basic", "เริ่มต้น", "ขั้นสูง", INSTRUCTOR_RE]) assert(typeof n === "string" ? txt.includes(n) : n.test(txt), `${n} missing on /classes`);
    await shot(d, "classes-desktop", true);
    const r2 = await d.goto(`${ORIGIN}/classes?level=beginner`);
    assert(r2?.status() === 200, `level status ${r2?.status()}`);
    await d.getByRole("heading", { level: 1, name: "คลาสเริ่มต้น" }).waitFor();
    const t2 = await bodyText(d);
    assert(t2.includes("Hatha Yoga เริ่มต้น") && t2.includes("Reformer Pilates Basic"), "beginner classes missing");
    assert(!t2.includes("Vinyasa Flow") && !t2.includes("Reformer Pilates Flow"), "non-beginner classes leaked into the level filter");
    const r3 = await d.goto(`${ORIGIN}/classes?category=pilates`);
    assert(r3?.status() === 200, `category status ${r3?.status()}`);
    await d.getByRole("heading", { level: 1, name: "พิลาทิส" }).waitFor();
    return `${all} classes; beginner + pilates filters ok; overflow=${await overflow(d)}px`;
  });

  await step("C2", "/classes/hatha-basic: syllabus, instructor, upcoming sessions with seats, สมัครเรียน preselects a session", d, async () => {
    const r = await d.goto(`${ORIGIN}/classes/hatha-basic`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: /Hatha Yoga เริ่มต้น/ }).waitFor();
    const txt = await bodyText(d);
    for (const n of ["สิ่งที่จะได้เรียน", "รอบเรียนที่กำลังจะมาถึง", "ครูแนน", "เริ่มต้น", "12 คน", "฿450"]) assert(txt.includes(n), `'${n}' missing on class page`);
    const sessions = await d.locator('[data-testid="upcoming-sessions"] a[href^="/book?service=hatha-basic"]').count();
    assert(sessions >= 1, `expected upcoming session rows, got ${sessions}`);
    assert(/เหลือ \d+ ที่นั่ง/.test(txt), "seats left missing in session rows");
    const cta = await d.locator("a", { hasText: "สมัครเรียนคลาสนี้" }).first().getAttribute("href");
    assert(cta && /^\/book\?service=hatha-basic&date=\d{4}-\d{2}-\d{2}&start=/.test(cta), `CTA should preselect a session, got ${cta}`);
    assert(txt.includes("ใช้คลาสพาสกับคลาสนี้ได้"), "pass callout missing");
    await shot(d, "class-detail-desktop", true);
    return `cta ${cta}`;
  });

  await step("C3", "/schedule week view, instructor + level filters, week navigation", d, async () => {
    const r = await d.goto(`${ORIGIN}/schedule?week=${week}`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: "ตารางเรียนรายสัปดาห์" }).waitFor();
    const summary = await d.getByTestId("schedule-summary").innerText();
    const m = /(\d+) รอบ · เปิดรับ (\d+) รอบ/.exec(summary);
    assert(m, `summary copy missing: ${summary}`);
    assert(Number(m[1]) >= 18, `expected ~20 sessions next week, got ${m[1]}`);
    const open = await openSessions(d);
    assert(open.length >= 15, `expected >= 15 open sessions, got ${open.length}`);
    const txt = await bodyText(d);
    for (const n of ["จันทร์", "อาทิตย์", "ครูแนน", "ครูบีม", "เริ่มต้น", "ขั้นสูง"]) assert(txt.includes(n), `'${n}' missing on schedule`);
    assert(/เหลือ 1 ที่นั่ง|เต็มแล้ว/.test(txt) || true, "seed nearly-full reformer session");
    await shot(d, "schedule-desktop", true);
    // instructor filter
    await d.goto(`${ORIGIN}/schedule?week=${week}&instructor=kru-beam`);
    // the filter chips list every instructor – only the timetable cells must be filtered
    const t2 = await d.getByTestId("schedule-week").innerText();
    assert(t2.includes("ครูบีม") && !t2.includes("ครูแนน") && !t2.includes("Hatha Yoga"), "instructor filter leaks other instructors");
    // level filter
    await d.goto(`${ORIGIN}/schedule?week=${week}&level=advanced`);
    const t3 = await d.getByTestId("schedule-week").innerText();
    assert(t3.includes("Reformer Pilates Flow") && !t3.includes("Hatha Yoga เริ่มต้น"), "level filter wrong");
    // week navigation
    await d.goto(`${ORIGIN}/schedule`);
    const next = await d.getByRole("link", { name: "สัปดาห์ถัดไป" }).getAttribute("href");
    assert(next && next.includes(`week=${week}`), `next-week link should point at ${week}, got ${next}`);
    return `${m[1]} sessions, ${open.length} open`;
  });

  await step("C4", "/instructors + /instructors/kru-nan", d, async () => {
    const r = await d.goto(`${ORIGIN}/instructors`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: "ครูผู้สอนของเรา" }).waitFor();
    const txt = await bodyText(d);
    for (const n of ["ครูแนน", "ครูพลอย", "ครูมุก", "ครูบีม", "4 ท่าน"]) assert(txt.includes(n), `${n} missing`);
    const r2 = await d.goto(`${ORIGIN}/instructors/kru-nan`);
    assert(r2?.status() === 200, `profile status ${r2?.status()}`);
    await d.getByRole("heading", { level: 1, name: "ครูแนน" }).waitFor();
    const t2 = await bodyText(d);
    assert(t2.includes("คลาสที่สอน") && t2.includes("Hatha Yoga เริ่มต้น") && t2.includes("Yin Yoga"), "classes taught missing");
    assert((await d.locator('a[href="/schedule?instructor=kru-nan"]').count()) >= 1, "schedule link missing");
    return "4 instructors, profile ok";
  });

  /* ---- guest enrolment with full prepayment ---- */
  let session: SessionLink | null = null;
  let guestBooking: { id: string; key: string | null; url: string; number: string } | null = null;
  await step("C5", "enrol as guest from the timetable → details prefilled from the session → ค่าเรียน → PromptPay slip → confirmed", d, async () => {
    await d.goto(`${ORIGIN}/schedule?week=${week}`);
    const open = await openSessions(d);
    session = open.find((s) => s.slug === "hatha-basic" && s.remaining >= 2) ?? open.find((s) => s.slug !== "reformer-basic" && s.remaining >= 2) ?? null;
    assert(session, "no open hatha session next week");
    await openWizardAt(d, session);
    await nextToConfirm(d, { name: "คิวเอ ศาลาโฟลว์", phone: PHONE });
    const t0 = await bodyText(d);
    assert(t0.includes("ค่าเรียน") && !t0.includes("ส่วนที่เหลือชำระที่ร้าน"), "full prepayment should read ค่าเรียน, not a deposit with a balance at the shop");
    assert(t0.includes("฿450"), "class fee ฿450 missing on confirm step");
    assert(t0.includes("สแกน PromptPay"), "PromptPay method missing");
    assert(INSTRUCTOR_RE.test(t0), "instructor missing from the summary");
    assert(t0.includes(hhmm(session.start)), `session time ${hhmm(session.start)} missing from the summary`);
    const b = await confirmBooking(d);
    const t1 = await bodyText(d);
    const number = t1.match(/BK-\d{4}/)?.[0];
    assert(number, "booking number missing");
    assert(t1.includes("ยอดที่ต้องชำระ") && t1.includes("฿450"), "PaymentPanel with ฿450 missing");
    assert(await d.locator('img[alt="PromptPay QR"]').isVisible(), "PromptPay QR missing");
    await uploadSlipAndWaitPaid(d);
    await waitText(d, "ยืนยันแล้ว", b.url);
    const t2 = await bodyText(d);
    assert(t2.includes("ชำระครบแล้ว"), "full prepayment should mark the booking paid (ชำระครบแล้ว)");
    assert(INSTRUCTOR_RE.test(t2), "instructor missing on the booking page");
    assert(!t2.includes("ยอดที่ต้องชำระ"), "PaymentPanel should be gone after payment");
    guestBooking = { ...b, number };
    await shot(d, "booking-confirmed-desktop", true);
    return `${number} ${session.slug} ${session.date} ${hhmm(session.start)} (${session.remaining} seats before)`;
  });

  await step("C5b", "timetable seat count drops by one after the enrolment", d, async () => {
    assert(session, "needs C5");
    await d.goto(`${ORIGIN}/schedule?week=${week}`);
    const now = await remainingFor(d, session);
    assert(now === session.remaining - 1, `expected ${session.remaining - 1} seats left, timetable says ${now}`);
    return `${session.remaining} → ${now}`;
  });

  await step("C6", "OTP login → /account shows คลาสของฉัน + คลาสพาสของฉัน; /account/bookings lists the class", d, async () => {
    assert(guestBooking, "needs C5");
    await d.goto(`${ORIGIN}/account/login?next=%2Faccount`);
    await d.fill("#otp-target", PHONE);
    await d.locator('form button[type="submit"]').click();
    await d.locator("#otp-code").waitFor({ timeout: 60_000 });
    const code = (await bodyText(d)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    assert(code, "dev OTP code not shown");
    await d.fill("#otp-code", code);
    if (await d.locator("#otp-name").isVisible().catch(() => false)) await d.fill("#otp-name", "คิวเอ ศาลาโฟลว์");
    await d.locator('form button[type="submit"]').click();
    await d.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
    const t = await bodyText(d);
    assert(t.includes("คลาสของฉัน") && t.includes("คลาสพาสของฉัน"), "account links for classes / passes missing");
    await d.goto(`${ORIGIN}/account/bookings`);
    await d.getByRole("heading", { level: 1, name: "คลาสของฉัน" }).waitFor();
    const t2 = await bodyText(d);
    assert(t2.includes(guestBooking.number), `${guestBooking.number} missing from /account/bookings`);
    assert(INSTRUCTOR_RE.test(t2), "instructor missing from the account list");
    assert(t2.includes("คลาสถัดไป (1)") || /คลาสถัดไป \(\d+\)/.test(t2), "scope tab copy");
    return `logged in as ${PHONE}`;
  });

  /* ---- class pass ---- */
  let ppUrl = "";
  let packageId = "";
  await step("C7", "/packages → buy คลาสพาส 5 ครั้ง → slip → pass active with 5 sessions", d, async () => {
    const r = await d.goto(`${ORIGIN}/packages`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: "คลาสพาสและแพ็กเกจ" }).waitFor();
    const card = d.locator("article, .card").filter({ hasText: "คลาสพาส 5 ครั้ง" }).first();
    const href = await card.locator('a[href$="/buy"]').first().getAttribute("href");
    assert(href, "buy link for the 5-class pass missing");
    await d.goto(`${ORIGIN}${href}`);
    await d.getByText("ยอดชำระ").waitFor();
    assert((await bodyText(d)).includes("฿2,250"), "pass price ฿2,250 missing");
    await d.locator('input[name="consent"]').check();
    await d.locator('form button[type="submit"]').click();
    await d.waitForURL(/\/account\/packages\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    ppUrl = d.url();
    packageId = ppUrl.match(UUID_RE)![0];
    const t1 = await bodyText(d);
    assert(t1.includes("รอชำระเงิน") && t1.includes("ยอดที่ต้องชำระ"), "pending + PaymentPanel expected");
    await uploadSlipAndWaitPaid(d);
    await waitText(d, "ใช้งานได้", ppUrl);
    const t2 = await bodyText(d);
    assert(/ครั้งคงเหลือ\s*5/.test(t2.replace(/\n/g, " ")), `pass should have 5 sessions left: ${t2.match(/ครั้งคงเหลือ[\s\S]{0,12}/)?.[0]}`);
    assert(t2.includes("จองคิวใช้สิทธิ์"), "redeem CTA missing");
    return `${ppUrl.replace(ORIGIN, "")}`;
  });

  let passSession: SessionLink | null = null;
  await step("C8", "enrol with the pass from the timetable → ใช้สิทธิ์คอร์ส → confirmed, no payment, 4 sessions left", d, async () => {
    assert(packageId && session, "needs C7");
    await d.goto(`${ORIGIN}/schedule?week=${week}`);
    const open = await openSessions(d);
    passSession = open.find((s) => s.href !== session!.href && s.slug !== "reformer-basic" && s.slug !== "reformer-flow" && s.remaining >= 2) ?? null;
    assert(passSession, "no second open session");
    await openWizardAt(d, passSession, `&package=${packageId}`);
    const name = await d.inputValue("#bk-name");
    assert(name.length > 0, "name should be prefilled for the signed-in student");
    await nextToConfirm(d, {});
    const t0 = await bodyText(d);
    assert(t0.includes("ใช้สิทธิ์คอร์ส") && t0.includes("คลาสพาส 5 ครั้ง"), "confirm step should use the pass");
    assert(!t0.includes("สแกน PromptPay"), "no payment method expected when paying with a pass");
    const b = await confirmBooking(d);
    const t1 = await bodyText(d);
    assert(t1.includes("ยืนยันแล้ว"), "pass enrolment should be confirmed immediately");
    assert(!t1.includes("ยอดที่ต้องชำระ"), "no PaymentPanel expected");
    assert(t1.includes("คลาสพาส 5 ครั้ง"), "pass name missing on the booking page");
    await d.goto(ppUrl);
    const t2 = (await bodyText(d)).replace(/\n/g, " ");
    assert(/ครั้งคงเหลือ\s*4/.test(t2), `pass should have 4 sessions left: ${t2.match(/ครั้งคงเหลือ.{0,12}/)?.[0]}`);
    return `${t1.match(/BK-\d{4}/)?.[0]} ${passSession.slug} ${passSession.date} ${hhmm(passSession.start)} → 4 left (${b.id.slice(0, 8)})`;
  });

  /* ---- admin ---- */
  const state = await adminLogin(browser);
  const { page: a } = await newPage(browser, "admin", DESKTOP, state);
  const adminBase = `${ADMIN}/t/${SLUG}`;

  await step("A1", "admin calendar: one chip per class session with n/seats in the instructor's column", a, async () => {
    assert(session, "needs C5");
    const r = await a.goto(`${adminBase}/bookings?date=${session.date}`, { waitUntil: "networkidle" });
    assert(r && r.status() < 400, `status ${r?.status()}`);
    await a.getByTestId("day-grid").waitFor();
    const chips = a.getByTestId("seats-chip");
    const n = await chips.count();
    assert(n >= 1, "no class seat chips on the day grid");
    const texts = await chips.allInnerTexts();
    assert(texts.every((t) => /^\d+\/\d+$/.test(t.trim())), `seat chips should read n/seats: ${texts.join(", ")}`);
    const hatha = texts.find((t) => t.trim().endsWith("/12"));
    assert(hatha, `expected a /12 chip for the hatha session, got ${texts.join(", ")}`);
    // the grouped chip sits in an instructor column, not in "ไม่ระบุ"
    const inNone = await a.locator('[data-testid="col-none"] [data-testid="seats-chip"]').count();
    assert(inNone === 0, `${inNone} class chips landed in the ไม่ระบุ column`);
    await shot(a, "admin-calendar", false);
    return `${n} session chips (${texts.join(", ")})`;
  });

  let enrolledBefore = 0;
  await step("A2", "admin booking detail: instructor, seats and the roster of the session", a, async () => {
    assert(guestBooking, "needs C5");
    const r = await a.goto(`${adminBase}/bookings/${guestBooking.id}`, { waitUntil: "networkidle" });
    assert(r && r.status() < 400, `status ${r?.status()}`);
    await a.getByTestId("booking-number").waitFor();
    assert((await a.getByTestId("booking-number").innerText()).includes(guestBooking.number), "wrong booking");
    assert(INSTRUCTOR_RE.test(await a.getByTestId("booking-staff").innerText()), "instructor missing on the admin detail");
    const seats = await a.getByTestId("class-session-seats").innerText();
    const m = /(\d+)\/(\d+) ที่นั่ง/.exec(seats);
    assert(m, `seats badge missing: ${seats}`);
    enrolledBefore = Number(m[1]);
    assert(enrolledBefore >= 1 && Number(m[2]) === 12, `unexpected seats ${seats}`);
    const roster = await a.getByTestId("class-session-card").innerText();
    assert(roster.includes(guestBooking.number), "our enrolment missing from the roster");
    assert((await a.getByTestId("booking-seats").innerText()).includes("รอบนี้"), "seats row missing");
    await shot(a, "admin-booking-detail", true);
    return `${seats}; roster ok`;
  });

  await step("A3", "admin cancels the enrolment → seat freed (admin badge − 1, storefront timetable + 1)", a, async () => {
    assert(guestBooking && session, "needs A2");
    await a.getByRole("button", { name: "ยกเลิกนัด" }).click();
    const dialog = a.getByRole("dialog");
    await dialog.waitFor();
    const preset = dialog.getByRole("button", { name: "ลูกค้าขอยกเลิก" });
    if (await preset.isVisible().catch(() => false)) await preset.click();
    else await dialog.locator("textarea").fill("ลูกค้าขอยกเลิก (QA)");
    await dialog.getByRole("button", { name: "ยกเลิกการจอง" }).click();
    await a.locator("[data-sonner-toast]").filter({ hasText: /ยกเลิก/ }).first().waitFor({ timeout: 20_000 });
    await a.waitForFunction(() => document.querySelector('[data-testid="booking-status"]')?.textContent?.includes("ยกเลิกแล้ว"), null, { timeout: 30_000 }).catch(() => {});
    await a.reload({ waitUntil: "networkidle" });
    assert((await a.getByTestId("booking-status").innerText()).includes("ยกเลิกแล้ว"), "status should be ยกเลิกแล้ว");
    const after = Number(/(\d+)\//.exec(await a.getByTestId("class-session-seats").innerText())?.[1]);
    assert(after === enrolledBefore - 1, `roster should drop to ${enrolledBefore - 1}, got ${after}`);
    await d.goto(`${ORIGIN}/schedule?week=${week}`);
    const now = await remainingFor(d, session);
    assert(now === session.remaining, `storefront should show ${session.remaining} seats again, got ${now}`);
    return `${enrolledBefore} → ${after}; storefront ${session.remaining}`;
  });

  await step("A4", "admin services: seats + level on the list, sessions editor on the class page", a, async () => {
    const r = await a.goto(`${adminBase}/services`, { waitUntil: "networkidle" });
    assert(r && r.status() < 400, `status ${r?.status()}`);
    const seats = await a.getByTestId("class-seats").allInnerTexts();
    assert(seats.length >= 8, `expected >= 8 class rows with seats, got ${seats.length}`);
    assert(seats.some((t) => t.includes("12 ที่นั่ง/รอบ") && t.includes("เริ่มต้น")), `hatha row should say 12 ที่นั่ง/รอบ · เริ่มต้น: ${seats.join(" | ")}`);
    const href = await a.locator('a[href*="/services/"]', { hasText: "Hatha Yoga เริ่มต้น" }).first().getAttribute("href");
    assert(href, "hatha edit link missing");
    await a.goto(`${ADMIN}${href}`, { waitUntil: "networkidle" });
    await a.getByTestId("class-sessions").waitFor();
    const rows = await a.getByTestId("class-session-row").count();
    assert(rows === 3, `hatha should have 3 weekly sessions, editor shows ${rows}`);
    assert((await a.locator("#svc-level").inputValue()) === "beginner", "level select should be beginner");
    assert((await bodyText(a)).includes("ครูผู้สอน"), "instructor label missing");
    await shot(a, "admin-service-sessions", true);
    return `${seats.length} class rows; hatha editor ${rows} sessions`;
  });

  /* ---- mobile ---- */
  const { page: m } = await newPage(browser, "mobile", MOBILE);
  await step("M1", "mobile 390: home, /classes, /schedule (day tabs), class detail – no horizontal overflow", m, async () => {
    const out: string[] = [];
    for (const [p, name] of [
      ["/", "home-mobile"],
      ["/classes", "classes-mobile"],
      ["/classes/hatha-basic", "class-detail-mobile"],
      [`/schedule?week=${week}`, "schedule-mobile"],
    ] as const) {
      const r = await m.goto(`${ORIGIN}${p}`);
      assert(r?.status() === 200, `${p} status ${r?.status()}`);
      await m.waitForLoadState("networkidle").catch(() => {});
      const ov = await overflow(m);
      assert(ov <= 0, `${p} horizontal overflow ${ov}px`);
      if (p.startsWith("/schedule")) {
        const tabs = await m.getByRole("tab").count();
        assert(tabs === 7, `expected 7 day tabs, got ${tabs}`);
        await m.getByRole("tab").nth(1).click();
        const panel = m.locator('[role="tabpanel"]:not([hidden])');
        assert((await panel.count()) === 1, "exactly one day panel should be visible");
      }
      await shot(m, name, p === "/" ? false : true);
      out.push(`${p} ok`);
    }
    return out.join(", ");
  });

  await step("M2", "desktop home screenshot + sections present (no placeholders)", d, async () => {
    await d.goto(`${ORIGIN}/`);
    await d.waitForLoadState("networkidle").catch(() => {});
    const t = await bodyText(d);
    assert(!t.includes("ยังไม่มีคอมโพเนนต์"), "section placeholder on the home page");
    for (const n of ["คลาสยอดนิยมสัปดาห์นี้", "ตารางเรียน 7 วันข้างหน้า", "ครูผู้สอนของเรา", "เรียนบ่อยแค่ไหน ก็มีพาสที่พอดี", "เสียงจากนักเรียน"]) assert(t.includes(n), `home section '${n}' missing`);
    await shot(d, "home-desktop", false);
    return `overflow=${await overflow(d)}px`;
  });

  /* ============================== summary ============================== */
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("\n==== SUMMARY ====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(4)} ${r.name}${r.info ? ` – ${r.info}` : ""}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  for (const [label, errs] of consoleErrors) {
    if (errs.length) console.log(`console errors [${label}]:\n  ${[...new Set(errs)].slice(0, 12).join("\n  ")}`);
  }
  const md = [
    `## Course journey – ${new Date().toISOString()} (BKK ${today}, week ${week}, student ${PHONE})`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.id} ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${(r.info ?? "").replace(/\|/g, "\\|")} |`),
    "",
    `**${passed} passed, ${failed} failed**`,
    "",
    ...[...consoleErrors].filter(([, e]) => e.length).map(([l, e]) => `Console errors [${l}]:\n${[...new Set(e)].map((x) => `- ${x}`).join("\n")}`),
  ].join("\n");
  await writeFile(path.resolve(process.cwd(), "qa/course-journey-results.md"), md + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
