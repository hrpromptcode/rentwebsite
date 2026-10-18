import "../load-env";
import http from "node:http";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, eq, getAdminDb, rentalBlockedDates, rentalExtras, rentalUnitTypes, tenants } from "@rentweb/db";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Hotel template journey (demo-hotel = "บ้านทะเล เขาหลัก", rental module) – the CUSTOMER half.
 *   pnpm --filter @rentweb/tooling exec tsx qa/rental-journey.ts
 * Desktop 1440: home (stay-search hero + room grid) → search dates + guests → /stay results → /rooms/family-villa
 * (the only single-unit type) → breakfast add-on → live quote → /stay/book → guest details → PromptPay slip → confirmed
 * (/stays/[id]?k=) → a second guest cannot take the last unit for overlapping dates (API, /stay, /stay/book, widget) →
 * a blocked date hides availability (calendar API, /stay, room calendar) → access key / owner access rules →
 * OTP login → /account/stays lists the stay → customer cancel within the free-cancellation window releases the unit.
 * Mobile 390: home, /rooms, /rooms/[slug], /stay/book, /stays/[id] (no horizontal overflow).
 * Prints PASS/FAIL per step, screenshots to tooling/screenshots/rental-*.png, writes tooling/qa/rental-journey-results.md.
 * The admin half (bookings tabs, check-in / check-out) is covered by the admin agent's script.
 */

const PORT = process.env.PORT ?? "3000";
const SLUG = "demo-hotel";
const ORIGIN = `http://${SLUG}.localhost:${PORT}`;
const SHOTS = path.resolve(process.cwd(), "screenshots");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
/** a fresh guest per run (10 digits starting with 0) */
const PHONE = `09${String(Date.now()).slice(-8)}`;
const GUEST_NAME = "คิวเอ ทดสอบการจอง";
const VILLA = "family-villa";
const VILLA_NAME = "แฟมิลี่ วิลล่า 2 ห้องนอน";
const GUESTS = 4;

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
      const file = path.join(SHOTS, `rental-FAIL-${id}.png`);
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
  const file = path.join(SHOTS, `rental-${name}.png`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
  return file;
}
async function waitText(page: Page, needle: string | RegExp, timeout = 20_000) {
  await page.waitForFunction((n) => (typeof n === "string" ? document.body.innerText.includes(n) : new RegExp(n.source, n.flags).test(document.body.innerText)), needle, { timeout }).catch(() => {});
  const t = await bodyText(page);
  assert(typeof needle === "string" ? t.includes(needle) : needle.test(t), `'${needle}' not shown (url ${page.url()})`);
}

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const thb = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

interface CalendarDay {
  date: string;
  remaining: number;
  price: number;
  past: boolean;
  blocked: boolean;
  bookable: boolean;
}
interface QuoteResp {
  ok: boolean;
  error?: string;
  remaining: number | null;
  quote?: { nights: number; roomTotal: number; extrasTotal: number; total: number; deposit: number; extras: Array<{ name: string; total: number }> };
}
/** JSON GET through 127.0.0.1 with the tenant Host header – Node cannot resolve *.localhost (only the browser can). */
function api<T>(_page: Page, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: Number(PORT), path: url, headers: { host: `${SLUG}.localhost:${PORT}`, accept: "application/json" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 400) return reject(new Error(`${url} → ${res.statusCode} ${body.slice(0, 160)}`));
        try {
          resolve(JSON.parse(body) as T);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
  });
}
const calendar = (page: Page, typeId: string, month: string) => api<{ days: CalendarDay[] }>(page, `/api/rental/calendar?type=${typeId}&month=${month}`);
const quote = (page: Page, typeId: string, from: string, to: string, guests = GUESTS, extras = "") => api<QuoteResp>(page, `/api/rental/quote?type=${typeId}&from=${from}&to=${to}&guests=${guests}${extras ? `&extras=${encodeURIComponent(extras)}` : ""}`);

/** Clicks a day in a RangeCalendar, paging forward until the month that holds it is shown. */
async function pickDay(page: Page, scope: ReturnType<Page["locator"]>, date: string) {
  for (let i = 0; i < 14; i++) {
    const btn = scope.locator(`[data-date="${date}"]`);
    if (await btn.count()) {
      await btn.first().scrollIntoViewIfNeeded();
      // the sticky transparent header can sit over a freshly scrolled-in control: click via the DOM, not the pointer
      await btn.first().evaluate((el) => (el as HTMLButtonElement).click());
      return;
    }
    const next = scope.getByRole("button", { name: "เดือนถัดไป" }).first();
    await next.waitFor({ state: "attached" });
    assert(await next.isEnabled(), `cannot page past ${date}: next-month disabled`);
    await next.evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForTimeout(200);
  }
  throw new Error(`day ${date} not reachable in the calendar`);
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const today = bkkToday();

  // seed facts from the DB (ids survive demo re-provisioning)
  const db = getAdminDb();
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  assert(tenant, `tenant ${SLUG} not found – run: pnpm --filter @rentweb/tooling reset-demo -- --template hotel`);
  const types = await db.select({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug, name: rentalUnitTypes.name, quantity: rentalUnitTypes.quantity }).from(rentalUnitTypes).where(eq(rentalUnitTypes.tenantId, tenant.id));
  const villa = types.find((t) => t.slug === VILLA);
  assert(villa && villa.quantity === 1, `unit type ${VILLA} with quantity 1 expected, got ${JSON.stringify(villa)}`);
  const blockedRows = await db
    .select({ date: rentalBlockedDates.date })
    .from(rentalBlockedDates)
    .where(and(eq(rentalBlockedDates.tenantId, tenant.id), eq(rentalBlockedDates.unitTypeId, villa.id)))
    .orderBy(asc(rentalBlockedDates.date));
  const blockedDate = blockedRows.find((b) => b.date > today)?.date;
  assert(blockedDate, "no future blocked date seeded for the family villa");
  const [breakfast] = await db.select({ id: rentalExtras.id, name: rentalExtras.name, price: rentalExtras.price }).from(rentalExtras).where(and(eq(rentalExtras.tenantId, tenant.id), eq(rentalExtras.name, "อาหารเช้า"))).limit(1);
  assert(breakfast, "breakfast extra not seeded");

  const browser = await chromium.launch();
  const { page: d } = await newPage(browser, "desktop");

  // the first 2-night window from +30 days where the single villa is free on both nights (re-runs / leftovers safe)
  let FROM = "";
  let TO = "";
  await step("C0", "pick free dates for the single villa from /api/rental/calendar", d, async () => {
    const months = new Map<string, Record<string, CalendarDay>>();
    const dayInfo = async (date: string) => {
      const mo = date.slice(0, 7);
      if (!months.has(mo)) months.set(mo, Object.fromEntries((await calendar(d, villa.id, mo)).days.map((x) => [x.date, x])));
      return months.get(mo)![date];
    };
    for (let n = 30; n < 90; n++) {
      const a = await dayInfo(addDays(today, n));
      const b = await dayInfo(addDays(today, n + 1));
      if (a?.bookable && b?.bookable && a.remaining >= 1 && b.remaining >= 1 && !a.blocked && !b.blocked) {
        FROM = addDays(today, n);
        TO = addDays(today, n + 2);
        break;
      }
    }
    assert(FROM && TO, "no free 2-night window within 90 days");
    return `${FROM} → ${TO} (blocked sample date ${blockedDate})`;
  });
  console.log(`BKK today ${today}; stay ${FROM} → ${TO}; guest ${PHONE}`);

  await step("C1", "home: stay-search hero, room grid, no placeholders", d, async () => {
    const r = await d.goto(`${ORIGIN}/`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByTestId("stay-search").waitFor();
    const t = await bodyText(d);
    assert(!t.includes("ยังไม่มีคอมโพเนนต์"), "section placeholder on the home page");
    for (const n of ["เลือกมุมที่ใช่ของคุณ", "วันหยุดที่ไม่ต้องรีบไปไหน", "อาหารเช้าที่เสิร์ฟตามเวลาของคุณ", "ก่อนเดินทาง", "ดีลักซ์ ซีวิว", "บีชฟรอนต์ พูลวิลล่า"]) assert(t.includes(n), `home copy '${n}' missing`);
    assert(/เริ่มต้น|฿\d/.test(t), "from-prices missing on the room grid");
    await shot(d, "home-desktop", false);
    return `overflow=${await overflow(d)}px`;
  });

  await step("C2", "home search: pick check-in / check-out + 4 guests → /stay results list the villa", d, async () => {
    const form = d.getByTestId("stay-search").first();
    await form.getByTestId("stay-search-from").click();
    const panel = d.locator('[role="grid"]').first();
    await panel.waitFor();
    await pickDay(d, d.locator("body"), FROM);
    await pickDay(d, d.locator("body"), TO);
    await waitText(d, "2 คืน");
    const inc = form.getByRole("button", { name: "เพิ่มจำนวนผู้เข้าพัก" });
    for (let i = 2; i < GUESTS; i++) await inc.click();
    assert((await form.getByTestId("guest-count").innerText()).includes(String(GUESTS)), "guest stepper did not reach 4");
    await form.getByTestId("stay-search-submit").click();
    await d.waitForURL((u) => u.pathname === "/stay" && u.searchParams.get("from") === FROM && u.searchParams.get("to") === TO && u.searchParams.get("guests") === String(GUESTS), { timeout: 60_000 });
    await d.getByRole("heading", { level: 1, name: "ค้นหาห้องว่าง" }).waitFor();
    const cards = d.getByTestId("stay-result");
    const n = await cards.count();
    assert(n >= 1, "no results");
    const villaCard = cards.filter({ hasText: VILLA_NAME });
    assert((await villaCard.count()) === 1, `villa card missing (${n} results)`);
    const href = await villaCard.getByTestId("result-select").getAttribute("href");
    assert(href && href.startsWith(`/rooms/${VILLA}?`) && href.includes(`from=${FROM}`) && href.includes(`to=${TO}`), `result link ${href}`);
    const t = await bodyText(d);
    assert(t.includes("เหลือห้องสุดท้าย"), "'last unit' badge missing on the single villa");
    await shot(d, "stay-results-desktop", true);
    return `${n} results; villa → ${href}`;
  });

  await step("C3", "/rooms: every type with from-price and check-in/out times", d, async () => {
    const r = await d.goto(`${ORIGIN}/rooms`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: "ห้องพักและวิลล่า" }).waitFor();
    const t = await bodyText(d);
    for (const n of ["ดีลักซ์ การ์เดน", "ดีลักซ์ ซีวิว", "พูลแอคเซส สวีท", "บีชฟรอนต์ พูลวิลล่า", VILLA_NAME, "เช็กอินตั้งแต่ 14:00", "เช็กเอาต์ก่อน 12:00"]) assert(t.includes(n), `'${n}' missing on /rooms`);
    const links = (await d.locator('a[href^="/rooms/"]').evaluateAll((els) => new Set(els.map((e) => (e.getAttribute("href") ?? "").split("?")[0])).size)) as number;
    assert(links >= 5, `expected 5 room links, got ${links}`);
    await shot(d, "rooms-desktop", true);
    return `${links} room types`;
  });

  let bookHref = "";
  let apiQuote: NonNullable<QuoteResp["quote"]> | null = null;
  await step("C4", "/rooms/family-villa: calendar + live quote, breakfast add-on re-quotes, จองเลย → /stay/book", d, async () => {
    const r = await d.goto(`${ORIGIN}/rooms/${VILLA}?from=${FROM}&to=${TO}&guests=${GUESTS}`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByRole("heading", { level: 1, name: VILLA_NAME }).waitFor();
    const widget = d.getByTestId("stay-widget");
    await widget.waitFor();
    await widget.getByTestId("quote-total").waitFor({ timeout: 30_000 });
    const base = await quote(d, villa.id, FROM, TO, GUESTS);
    assert(base.ok && base.quote && base.remaining === 1, `API quote before booking: ${JSON.stringify(base).slice(0, 200)}`);
    assert((await widget.getByTestId("quote-total").innerText()).includes(thb(base.quote.total)), `widget total ≠ API total ${thb(base.quote.total)}`);
    // breakfast: per guest per night → 4 × 2 × ฿450 (the add-ons live in a collapsed <details>)
    const details = widget.locator("details").filter({ hasText: "บริการเสริม" }).first();
    if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) await details.locator("summary").click();
    await widget.getByTestId(`extra-${breakfast.id}`).click();
    const withBf = await quote(d, villa.id, FROM, TO, GUESTS, `${breakfast.id}:1`);
    assert(withBf.ok && withBf.quote, "API quote with breakfast failed");
    assert(withBf.quote.extrasTotal === breakfast.price * GUESTS * 2, `breakfast total ${withBf.quote.extrasTotal} ≠ ${breakfast.price * GUESTS * 2}`);
    await d.waitForFunction((want) => document.querySelector('[data-testid="quote-total"]')?.textContent?.includes(want), thb(withBf.quote.total), { timeout: 20_000 });
    const t = await bodyText(d);
    for (const n of ["สิ่งอำนวยความสะดวก", "บริการเสริม", "ขั้นต่ำ 2 คืน", "สูงสุด 6 ท่าน", "120 ตร.ม."]) assert(t.includes(n), `'${n}' missing on the room page`);
    const cal = widget.locator(`[data-date="${FROM}"]`).first();
    assert((await cal.count()) === 1, "range calendar day for the check-in date not rendered");
    apiQuote = withBf.quote;
    await shot(d, "room-desktop", true);
    const book = widget.getByTestId("stay-widget-book");
    assert(await book.isEnabled(), "จองเลย disabled although the villa is free");
    await book.click();
    await d.waitForURL((u) => u.pathname === "/stay/book", { timeout: 60_000 });
    const u = new URL(d.url());
    bookHref = u.pathname + u.search;
    assert(u.searchParams.get("type") === VILLA && u.searchParams.get("from") === FROM && u.searchParams.get("to") === TO && u.searchParams.get("guests") === String(GUESTS), `book url ${bookHref}`);
    assert((u.searchParams.get("extras") ?? "").startsWith(`${breakfast.id}:1`), `breakfast not carried into /stay/book: ${u.searchParams.get("extras")}`);
    return `total ${thb(withBf.quote.total)} (room ${thb(withBf.quote.roomTotal)} + breakfast ${thb(withBf.quote.extrasTotal)}), deposit ${thb(withBf.quote.deposit)}`;
  });

  let stayId = "";
  let stayKey = "";
  let stayNumber = "";
  await step("C5", "/stay/book: guest details + consent → pending stay with PaymentPanel → slip → confirmed", d, async () => {
    assert(bookHref && apiQuote, "needs C4");
    await d.getByRole("heading", { level: 1, name: "จองห้องพัก" }).waitFor();
    const form = d.getByTestId("book-form");
    const t0 = await bodyText(d);
    assert(t0.includes("เหลือห้องสุดท้าย"), "last-unit notice missing on the book page");
    assert(t0.includes("อาหารเช้า") && t0.includes(thb(apiQuote.total)), "quote breakdown with breakfast missing");
    assert(t0.includes("ยกเลิกฟรีจนถึง 7 วันก่อนวันเช็กอิน"), "cancellation policy copy missing");
    await form.getByTestId("book-name").fill(GUEST_NAME);
    await form.getByTestId("book-phone").fill(PHONE);
    await form.getByTestId("book-email").fill(`qa-${PHONE}@example.com`);
    await form.getByTestId("book-note").fill("ทดสอบระบบ (QA) ขอเตียงเด็ก 1 เตียง");
    // submitting without consent is refused in place
    await form.getByTestId("book-submit").click();
    await form.getByTestId("book-error").waitFor({ timeout: 10_000 });
    await form.getByTestId("book-consent").check();
    await shot(d, "book-desktop", true);
    await form.getByTestId("book-submit").click();
    await d.waitForURL(/\/stays\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
    const u = new URL(d.url());
    stayId = u.pathname.match(UUID_RE)![0];
    stayKey = u.searchParams.get("k") ?? "";
    assert(stayKey.length >= 16, "access key missing from the redirect");
    await d.getByTestId("stay-number").waitFor();
    stayNumber = (await d.getByTestId("stay-number").innerText()).match(/ST-\d+/)?.[0] ?? "";
    assert(stayNumber, "stay number missing");
    assert((await d.getByTestId("stay-status").innerText()).includes("รอชำระเงิน"), "new stay should be pending");
    const t1 = await bodyText(d);
    assert(t1.includes(thb(apiQuote.deposit)), `deposit ${thb(apiQuote.deposit)} not shown`);
    assert(t1.includes("อาหารเช้า") && t1.includes(GUEST_NAME), "summary (breakfast / guest) missing");
    await shot(d, "stay-pending-desktop", true);
    // PromptPay QR + slip upload (DEV_AUTO_APPROVE_SLIPS=true → paid → onStayPaid confirms)
    await waitText(d, "แนบสลิปโอนเงิน");
    await d.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
    await waitText(d, "ชำระเงินสำเร็จ", 45_000);
    await d.goto(`${ORIGIN}/stays/${stayId}?k=${encodeURIComponent(stayKey)}`);
    await d.getByTestId("stay-status").waitFor();
    const status = await d.getByTestId("stay-status").innerText();
    assert(status.includes("ยืนยันแล้ว"), `after payment expected ยืนยันแล้ว, got ${status}`);
    const t2 = await bodyText(d);
    assert(t2.includes("จองสำเร็จ"), "confirmed headline missing");
    assert(t2.includes("ชำระมัดจำแล้ว"), "payment status should be deposit_paid");
    assert(t2.includes("การเดินทาง") || t2.includes("โทรหาที่พัก"), "directions / contact block missing");
    await shot(d, "stay-confirmed-desktop", true);
    return `${stayNumber} ${stayId} confirmed, deposit ${thb(apiQuote.deposit)} paid`;
  });

  await step("C6", "second guest cannot book the last unit for overlapping dates (API, /stay, /stay/book, widget)", null, async () => {
    assert(stayId, "needs C5");
    const { ctx, page: g } = await newPage(browser, "guest2");
    try {
      const q = await quote(g, villa.id, addDays(FROM, 1), addDays(TO, 1), 2);
      assert(q.ok && q.remaining === 0, `overlapping quote should have 0 units left: ${JSON.stringify(q).slice(0, 160)}`);
      const q2 = await quote(g, villa.id, TO, addDays(TO, 2), 2);
      assert(q2.ok && q2.remaining === 1, `back-to-back stay from the check-out day must be free (exclusive check-out): ${JSON.stringify(q2).slice(0, 160)}`);
      await g.goto(`${ORIGIN}/stay?from=${FROM}&to=${TO}&guests=${GUESTS}`);
      await g.getByRole("heading", { level: 1, name: "ค้นหาห้องว่าง" }).waitFor();
      assert((await g.getByTestId("stay-result").filter({ hasText: VILLA_NAME }).count()) === 0, "villa still offered on /stay");
      const txt = await bodyText(g);
      assert(txt.includes(VILLA_NAME) && txt.includes("ไม่ว่างในวันที่เลือก"), "villa not listed as unavailable");
      const r = await g.goto(`${ORIGIN}/stay/book?type=${VILLA}&from=${FROM}&to=${TO}&guests=${GUESTS}`);
      assert(r?.status() === 200, `book status ${r?.status()}`);
      await waitText(g, "ไม่ว่างในวันที่เลือก");
      assert((await g.getByTestId("book-form").count()) === 0, "book form rendered for a sold-out stay");
      await g.goto(`${ORIGIN}/rooms/${VILLA}?from=${FROM}&to=${TO}&guests=${GUESTS}`);
      const widget = g.getByTestId("stay-widget");
      await widget.waitFor();
      await g.waitForFunction(() => document.querySelector('[data-testid="stay-widget-book"]')?.hasAttribute("disabled"), undefined, { timeout: 30_000 });
      const wtxt = await widget.innerText();
      assert(/เต็มแล้ว|ไม่ว่าง/.test(wtxt), `widget should say sold out / unavailable, got: ${wtxt.replace(/\s+/g, " ").slice(0, 160)}`);
      // server-side guard: the action refuses too (direct POST through the form is covered by the page states above)
      return `remaining 0 for ${addDays(FROM, 1)}→${addDays(TO, 1)}, 1 for ${TO}→${addDays(TO, 2)}`;
    } finally {
      await ctx.close();
    }
  });

  await step("C7", "blocked date hides availability (calendar API, /stay results, room calendar)", d, async () => {
    const B = blockedDate;
    const cal = await calendar(d, villa.id, B.slice(0, 7));
    const day = cal.days.find((x) => x.date === B);
    assert(day && day.blocked && !day.bookable && day.remaining === 0, `calendar day ${B}: ${JSON.stringify(day)}`);
    const q = await quote(d, villa.id, addDays(B, -1), addDays(B, 1), 2);
    assert(q.ok && q.remaining === 0, `range over the blocked night should have 0 left: ${JSON.stringify(q).slice(0, 160)}`);
    await d.goto(`${ORIGIN}/stay?from=${addDays(B, -1)}&to=${addDays(B, 1)}&guests=2`);
    await d.getByRole("heading", { level: 1, name: "ค้นหาห้องว่าง" }).waitFor();
    assert((await d.getByTestId("stay-result").filter({ hasText: VILLA_NAME }).count()) === 0, "villa offered on a blocked date");
    await d.goto(`${ORIGIN}/rooms/${VILLA}?from=${addDays(B, -1)}&to=${addDays(B, 1)}&guests=2`);
    const widget = d.getByTestId("stay-widget");
    await widget.waitFor();
    await widget.locator(`[data-date="${B}"]`).first().waitFor();
    await d.waitForFunction((date) => (document.querySelector(`[data-date="${date}"]`)?.getAttribute("aria-label") ?? "").includes("ปิดจอง"), B, { timeout: 30_000 });
    return `${B} blocked → remaining 0, calendar cell ปิดจอง`;
  });

  await step("C8", "guest page access: no key / wrong key refused, right key ok", d, async () => {
    assert(stayId, "needs C5");
    await d.goto(`${ORIGIN}/stays/${stayId}`);
    await waitText(d, "ไม่สามารถเปิดการจองนี้ได้");
    await d.goto(`${ORIGIN}/stays/${stayId}?k=wrong-key-000000`);
    await waitText(d, "ไม่สามารถเปิดการจองนี้ได้");
    await d.goto(`${ORIGIN}/stays/${stayId}?k=${encodeURIComponent(stayKey)}`);
    await d.getByTestId("stay-number").waitFor();
    return "anonymous → refused, key → ok";
  });

  await step("C9", "OTP login as the guest → /account links การเข้าพักของฉัน → /account/stays lists the stay → owner opens it without a key", d, async () => {
    assert(stayId, "needs C5");
    await d.goto(`${ORIGIN}/account/login?next=%2Faccount`);
    await d.fill("#otp-target", PHONE);
    await d.locator('form button[type="submit"]').click();
    await d.locator("#otp-code").waitFor({ timeout: 60_000 });
    const code = (await bodyText(d)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    assert(code, "dev OTP code not shown");
    await d.fill("#otp-code", code);
    if (await d.locator("#otp-name").isVisible().catch(() => false)) await d.fill("#otp-name", GUEST_NAME);
    await d.locator('form button[type="submit"]').click();
    await d.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
    assert((await bodyText(d)).includes("การเข้าพักของฉัน"), "/account link to stays missing");
    await d.goto(`${ORIGIN}/account/stays`);
    await d.getByRole("heading", { level: 1, name: "การเข้าพักของฉัน" }).waitFor();
    const rows = d.getByTestId("stay-row");
    assert((await rows.count()) >= 1, "no stay rows");
    const t = await bodyText(d);
    assert(t.includes(stayNumber) && t.includes(VILLA_NAME) && t.includes("ยืนยันแล้ว"), `${stayNumber} missing from /account/stays`);
    await shot(d, "account-stays-desktop", true);
    await rows.filter({ hasText: stayNumber }).first().click();
    await d.waitForURL(new RegExp(`/stays/${stayId}`), { timeout: 60_000 });
    await d.getByTestId("stay-number").waitFor();
    assert((await d.getByTestId("stay-status").innerText()).includes("ยืนยันแล้ว"), "owner view should show the confirmed stay");
    return `logged in as ${PHONE}; ${stayNumber} listed`;
  });

  /* ---------- mobile 390 (before the cancellation so the confirmed stay page is captured) ---------- */
  await step("M1", "mobile 390: home, /rooms, /rooms/[slug], /stay/book, /stays/[id] render without horizontal overflow", null, async () => {
    const { ctx, page: m } = await newPage(browser, "mobile", MOBILE);
    try {
      const out: string[] = [];
      const pages: Array<[string, string, string]> = [
        ["home-mobile", "/", "stay-search"],
        ["rooms-mobile", "/rooms", ""],
        ["room-mobile", `/rooms/${VILLA}?from=${TO}&to=${addDays(TO, 2)}&guests=2`, "stay-widget"],
        ["book-mobile", `/stay/book?type=deluxe-seaview&from=${FROM}&to=${TO}&guests=2&extras=${breakfast.id}:1`, "book-form"],
        ["stay-mobile", `/stays/${stayId}?k=${encodeURIComponent(stayKey)}`, "stay-number"],
      ];
      for (const [name, url, testId] of pages) {
        const r = await m.goto(`${ORIGIN}${url}`);
        assert(r?.status() === 200, `${url} status ${r?.status()}`);
        if (testId) await m.getByTestId(testId).first().waitFor({ timeout: 30_000 });
        else await m.getByRole("heading", { level: 1 }).first().waitFor();
        await m.waitForLoadState("networkidle").catch(() => {});
        const o = await overflow(m);
        assert(o <= 1, `${url} overflows by ${o}px`);
        await shot(m, name, name === "home-mobile" ? false : true);
        out.push(`${url.split("?")[0]} ok`);
      }
      // the room page's calendar is usable with a thumb: pick a range on the range calendar at 390
      await m.goto(`${ORIGIN}/rooms/deluxe-seaview`);
      const widget = m.getByTestId("stay-widget");
      await widget.waitFor();
      await widget.locator(`[data-date="${addDays(today, 2)}"]`).first().waitFor({ timeout: 30_000 });
      await pickDay(m, widget, addDays(today, 40));
      await pickDay(m, widget, addDays(today, 42));
      await widget.getByTestId("quote-total").waitFor({ timeout: 30_000 });
      const box = await widget.locator(`[data-date="${addDays(today, 40)}"]`).first().boundingBox();
      assert(box && box.height >= 40, `calendar day target too small: ${box?.height}px`);
      return `${out.join(", ")}; calendar day ${Math.round(box.height)}px tall`;
    } finally {
      await ctx.close();
    }
  });

  await step("C10", "customer cancels within the free window → cancelled + unit released", d, async () => {
    assert(stayId, "needs C5");
    await d.goto(`${ORIGIN}/stays/${stayId}?k=${encodeURIComponent(stayKey)}`);
    const actions = d.getByTestId("stay-actions");
    await actions.waitFor();
    assert((await actions.getByTestId("cancel-preview").innerText()).includes("ยกเลิกได้ฟรี"), "free cancellation not offered 30 days ahead");
    await actions.getByTestId("cancel-open").click();
    await actions.locator("#cancel-reason").fill("แผนการเดินทางเปลี่ยน (QA)");
    await actions.getByTestId("cancel-confirm").click();
    await d.waitForFunction(() => document.querySelector('[data-testid="stay-status"]')?.textContent?.includes("ยกเลิก"), undefined, { timeout: 60_000 });
    const t = await bodyText(d);
    assert(t.includes("การจองนี้ถูกยกเลิกแล้ว"), "cancelled headline missing");
    assert(t.includes("ที่พักได้รับเงินหลังการจองถูกยกเลิก") || t.includes("คืนเงิน"), "refund note missing for a paid deposit");
    assert((await d.getByTestId("cancel-open").count()) === 0, "cancel still offered after cancellation");
    const q = await quote(d, villa.id, FROM, TO, GUESTS);
    assert(q.ok && q.remaining === 1, `unit not released after cancel: ${JSON.stringify(q).slice(0, 160)}`);
    await d.goto(`${ORIGIN}/account/stays?scope=past`);
    await d.getByRole("heading", { level: 1, name: "การเข้าพักของฉัน" }).waitFor();
    assert((await bodyText(d)).includes(stayNumber), "cancelled stay missing from the history tab");
    return `${stayNumber} cancelled, villa free again for ${FROM}→${TO}`;
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
    `## Rental (hotel) customer journey – ${new Date().toISOString()} (BKK ${today}, stay ${FROM} → ${TO}, guest ${PHONE})`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.id} ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${(r.info ?? "").replace(/\|/g, "\\|")} |`),
    "",
    `**${passed} passed, ${failed} failed**`,
    "",
    ...[...consoleErrors].filter(([, e]) => e.length).map(([l, e]) => `Console errors [${l}]:\n${[...new Set(e)].map((x) => `- ${x}`).join("\n")}`),
  ].join("\n");
  await writeFile(path.resolve(process.cwd(), "qa/rental-journey-results.md"), md + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
