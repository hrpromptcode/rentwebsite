import "../load-env";
import http from "node:http";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, eq, eventSessions, events, getAdminDb, tenants, ticketTypes } from "@rentweb/db";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Events template journey (demo-events = "Maker Yard Bangkok", events module) – the CUSTOMER half.
 *   pnpm --filter @rentweb/tooling exec tsx qa/events-journey.ts
 * Desktop 1440: home (featured-event hero + countdown + grid + highlights) → /events (tabs, search, category) →
 * /events/riverside-live (states: closed early bird, not-yet-open door tickets, VIP remaining) → quote API rules →
 * buy 2 Regular + 1 VIP as a guest through the 4-step picker → /tickets/[id]?k= pending with hold countdown →
 * slip → paid → 3 QR e-tickets with holder names → .ics download → public single-ticket view (first name only) →
 * access rules → a second buyer cannot exceed the remaining VIP quantity (API + widget cap) → closed / not-started
 * types are not purchasable → an unpaid order holds quantity and customer cancel releases it → OTP login shows the
 * order in /account/tickets and opens it without a key.
 * Mobile 390: home, /events, /events/[slug] + buy bar, the picker, /tickets/[id] (no horizontal overflow).
 * Prints PASS/FAIL per step, screenshots to tooling/screenshots/events-*.png, writes tooling/qa/events-journey-results.md.
 * Re-runs keep buying 1 VIP each; when VIP sells out run: pnpm --filter @rentweb/tooling reset-demo -- --template events
 */

const PORT = process.env.PORT ?? "3000";
const SLUG = "demo-events";
const ORIGIN = `http://${SLUG}.localhost:${PORT}`;
const SHOTS = path.resolve(process.cwd(), "screenshots");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
/** a fresh guest per run (10 digits starting with 0) */
const PHONE = `09${String(Date.now()).slice(-8)}`;
const PHONE2 = `08${String(Date.now() + 7).slice(-8)}`;
const BUYER = "คิวเอ ทดสอบบัตร";
const HOLDERS = ["คิวเอ ทดสอบบัตร", "สมหญิง เพื่อนร่วมงาน", "John Tester"];
const EVENT_SLUG = "riverside-live";
const EVENT_TITLE = "Riverside Live";
const REGULAR_PRICE = 89_000;
const VIP_PRICE = 249_000;

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
      const file = path.join(SHOTS, `events-FAIL-${id}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`     screenshot: ${file}  url: ${page.url()}`);
    }
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function newPage(browser: Browser, label: string, viewport = DESKTOP): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" });
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
  const file = path.join(SHOTS, `events-${name}.png`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
  return file;
}
async function waitText(page: Page, needle: string | RegExp, timeout = 20_000) {
  await page.waitForFunction((n) => (typeof n === "string" ? document.body.innerText.includes(n) : new RegExp(n.source, n.flags).test(document.body.innerText)), needle, { timeout }).catch(() => {});
  const t = await bodyText(page);
  assert(typeof needle === "string" ? t.includes(needle) : needle.test(t), `'${needle}' not shown (url ${page.url()})`);
}
const thb = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

interface QuoteResp {
  ok: boolean;
  error?: string;
  quote?: { lines: Array<{ ticketTypeId: string; name: string; unitPrice: number; qty: number; total: number }>; quantity: number; subtotal: number; discount: number; total: number; promo: string | null };
}
interface RawResp {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}
/** GET through 127.0.0.1 with the tenant Host header – Node cannot resolve *.localhost (only the browser can). */
function rawGet(url: string, accept = "application/json"): Promise<RawResp> {
  return new Promise<RawResp>((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: Number(PORT), path: url, headers: { host: `${SLUG}.localhost:${PORT}`, accept } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}
async function quote(eventId: string, sessionId: string, lines: Array<[string, number]>, promo?: string): Promise<QuoteResp> {
  const qs = new URLSearchParams({ event: eventId, session: sessionId, lines: lines.map(([id, q]) => `${id}:${q}`).join(",") });
  if (promo) qs.set("promo", promo);
  const r = await rawGet(`/api/events/quote?${qs}`);
  try {
    return JSON.parse(r.body) as QuoteResp;
  } catch {
    throw new Error(`quote → ${r.status} ${r.body.slice(0, 120)}`);
  }
}

/* ------------------------------------------------------------------ */
/* picker driver                                                        */
/* ------------------------------------------------------------------ */

interface BuyOpts {
  lines: Array<[typeId: string, qty: number]>;
  buyer: string;
  phone: string;
  email?: string;
  holders?: string[];
  /** screenshot name per step (desktop run) */
  shots?: string;
}
/** Drives the 4-step buy widget on an event page that is already open; resolves with the order id + access key. */
async function buyViaPicker(page: Page, o: BuyOpts): Promise<{ orderId: string; key: string; total: number }> {
  const picker = page.getByTestId("ticket-picker");
  await picker.waitFor();
  assert((await picker.getAttribute("data-state")) !== "closed", "picker is closed for this event");
  for (const [typeId, qty] of o.lines) {
    const inc = page.getByTestId(`qty-inc-${typeId}`);
    for (let i = 0; i < qty; i++) {
      await inc.scrollIntoViewIfNeeded();
      await inc.evaluate((el) => (el as HTMLButtonElement).click());
      await page.waitForTimeout(80);
    }
    assert((await page.getByTestId(`qty-${typeId}`).innerText()).trim() === String(qty), `qty for ${typeId} should be ${qty}`);
  }
  const expected = o.lines.reduce((s, [, q]) => s + q, 0);
  await page.waitForFunction((n) => document.querySelector('[data-testid="picker-total"]')?.textContent?.includes("฿") || n === 0, expected, { timeout: 20_000 });
  const totalText = await page.getByTestId("picker-total").innerText();
  const total = Number(totalText.replace(/[^\d]/g, "")) * 100;
  assert(total > 0, `picker total not shown (${totalText})`);
  if (o.shots) await shot(page, `${o.shots}-step1-tickets`, false);

  await page.getByTestId("picker-next").evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForSelector('[data-testid="ticket-picker"][data-step="1"]');
  await page.getByTestId("picker-buyer").fill(o.buyer);
  if (o.holders) {
    const same = page.getByTestId("picker-same-as-buyer");
    if (await same.isChecked()) await same.evaluate((el) => (el as HTMLInputElement).click());
    for (let i = 0; i < o.holders.length; i++) await page.getByTestId(`holder-${i}`).fill(o.holders[i]!);
  }
  if (o.shots) await shot(page, `${o.shots}-step2-holders`, false);
  await page.getByTestId("picker-next").evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForSelector('[data-testid="ticket-picker"][data-step="2"]');
  assert((await page.getByTestId("picker-name").inputValue()) === o.buyer, "buyer name should carry into the contact step");
  await page.getByTestId("picker-phone").fill(o.phone);
  if (o.email) await page.getByTestId("picker-email").fill(o.email);
  await page.getByTestId("picker-next").evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForSelector('[data-testid="ticket-picker"][data-step="3"]');
  const terms = page.getByTestId("picker-terms");
  if (!(await terms.isChecked())) await terms.evaluate((el) => (el as HTMLInputElement).click());
  if (o.shots) await shot(page, `${o.shots}-step4-summary`, false);
  await page.getByTestId("picker-submit").evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
  const u = new URL(page.url());
  const orderId = u.pathname.match(UUID_RE)![0];
  const key = u.searchParams.get("k") ?? "";
  assert(key.length >= 16, "access key missing from the redirect");
  return { orderId, key, total };
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(SHOTS, { recursive: true });

  // seed facts from the DB (ids survive demo re-provisioning)
  const db = getAdminDb();
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  assert(tenant, `tenant ${SLUG} not found – run: pnpm --filter @rentweb/tooling reset-demo -- --template events`);
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(and(eq(events.tenantId, tenant.id), eq(events.slug, EVENT_SLUG))).limit(1);
  assert(event, `event ${EVENT_SLUG} not seeded`);
  const [session] = await db.select({ id: eventSessions.id }).from(eventSessions).where(and(eq(eventSessions.tenantId, tenant.id), eq(eventSessions.eventId, event.id))).orderBy(asc(eventSessions.sort)).limit(1);
  assert(session, "concert session not seeded");
  const typeRows = () => db.select({ id: ticketTypes.id, name: ticketTypes.name, quantity: ticketTypes.quantity, sold: ticketTypes.sold, reserved: ticketTypes.reserved, price: ticketTypes.price }).from(ticketTypes).where(and(eq(ticketTypes.tenantId, tenant.id), eq(ticketTypes.eventId, event.id))).orderBy(asc(ticketTypes.sort));
  const types = await typeRows();
  const byName = (s: string) => types.find((t) => t.name.includes(s));
  const early = byName("Early Bird");
  const regular = byName("Regular");
  const vip = byName("VIP");
  const door = byName("บัตรหน้างาน");
  assert(early && regular && vip && door, `concert ticket types missing: ${types.map((t) => t.name).join(", ")}`);
  assert(regular.price === REGULAR_PRICE && vip.price === VIP_PRICE, "seeded concert prices changed – update the journey constants");
  const remainingOf = async (id: string) => {
    const t = (await typeRows()).find((x) => x.id === id)!;
    return (t.quantity ?? Infinity) - t.sold - t.reserved;
  };
  const vipBefore = await remainingOf(vip.id);
  assert(vipBefore >= 2, `VIP needs ≥ 2 remaining for this journey (now ${vipBefore}) – reset-demo --template events`);
  console.log(`tenant ${tenant.id}; event ${event.id}; VIP remaining ${vipBefore}; guest ${PHONE}`);

  const browser = await chromium.launch();
  const { page: d } = await newPage(browser, "desktop");

  await step("E1", "home: featured-event hero with countdown + ซื้อบัตร, upcoming grid, highlights, organizer, FAQ", d, async () => {
    const r = await d.goto(`${ORIGIN}/`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByTestId("event-hero").waitFor();
    const t = await bodyText(d);
    assert(!t.includes("ยังไม่มีคอมโพเนนต์"), "section placeholder on the home page");
    assert(t.includes(EVENT_TITLE), "featured concert missing from the hero");
    assert((await d.getByTestId("countdown").count()) >= 1, "countdown missing");
    assert((await d.getByTestId("hero-cta").count()) >= 1, "hero ซื้อบัตร CTA missing");
    assert((await d.getByTestId("event-card").count()) >= 4, "upcoming event cards missing");
    for (const n of ["งานที่กำลังจะมาถึง", "บรรยากาศงานที่ผ่านมา", "Maker Yard", "ก่อนซื้อบัตร", "Design Talk 2026", "Khlong San Night Run"]) assert(t.includes(n), `home copy '${n}' missing`);
    assert(/เริ่มต้น|฿\d/.test(t), "from-prices missing on the event grid");
    await shot(d, "home-desktop", false);
    await shot(d, "home-desktop-full", true);
    return `overflow=${await overflow(d)}px`;
  });

  await step("E2", "/events: upcoming/past tabs, category chips, search", d, async () => {
    await d.goto(`${ORIGIN}/events`);
    await d.getByTestId("events-scope").waitFor();
    let t = await bodyText(d);
    for (const n of [EVENT_TITLE, "Design Talk 2026", "Khlong San Night Run", "เวิร์กช็อปเครื่องหนัง"]) assert(t.includes(n), `upcoming '${n}' missing`);
    assert(!t.includes("Maker Market ครั้งที่ 7"), "ended event listed under upcoming");
    assert(t.includes("บัตรหมด") || t.includes("เริ่มต้น"), "card badges / from-price missing");
    assert((await d.getByTestId("events-categories").count()) === 1, "category chips missing");
    await shot(d, "events-desktop", false);
    await d.goto(`${ORIGIN}/events?scope=past`);
    await d.getByTestId("events-scope").waitFor();
    t = await bodyText(d);
    assert(t.includes("Maker Market ครั้งที่ 7"), "past event missing from the past tab");
    assert(!t.includes("Khlong San Night Run"), "upcoming event leaked into the past tab");
    await d.goto(`${ORIGIN}/events?q=Night`);
    await d.getByTestId("events-scope").waitFor();
    t = await bodyText(d);
    assert(t.includes("Khlong San Night Run") && !t.includes("Design Talk 2026"), "search q=Night should keep only the run");
    await d.goto(`${ORIGIN}/events?q=zzzzqqq`);
    await waitText(d, "ไม่พบอีเวนต์");
    await d.goto(`${ORIGIN}/events?category=${encodeURIComponent("ดนตรี")}`);
    await d.getByTestId("events-scope").waitFor();
    t = await bodyText(d);
    assert(t.includes(EVENT_TITLE) && !t.includes("Khlong San Night Run"), "category filter ดนตรี should keep only the concert");
    return "tabs, search, empty state and category filter ok";
  });

  await step("E3", "/events/riverside-live: cover, when/where + map, ticket states (closed early bird, not-yet-open door, VIP remaining), JSON-LD", d, async () => {
    const r = await d.goto(`${ORIGIN}/events/${EVENT_SLUG}`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await d.getByTestId("ticket-picker").waitFor();
    const t = await bodyText(d);
    for (const n of [EVENT_TITLE, "ประตูเปิด", "เส้นทาง", "ปิดการจำหน่ายแล้ว", "ยังไม่เปิดจำหน่าย", `เหลือ ${vipBefore} ใบ`, "Early Bird", "VIP", "Regular", "เงื่อนไขบัตร"]) assert(t.includes(n), `event page '${n}' missing`);
    assert((await d.getByTestId("countdown").count()) >= 1, "countdown missing");
    assert((await d.getByTestId("ticket-type-list").count()) >= 1, "ticket type list missing");
    assert(await d.getByTestId(`qty-inc-${early!.id}`).isDisabled(), "closed early bird should not be selectable");
    assert(await d.getByTestId(`qty-inc-${door!.id}`).isDisabled(), "not-yet-open door ticket should not be selectable");
    assert(!(await d.getByTestId(`qty-inc-${vip!.id}`).isDisabled()), "VIP should be selectable");
    const ld = await d.locator('script[type="application/ld+json"]').allTextContents();
    assert(ld.some((s) => s.includes('"Event"') && s.includes(EVENT_TITLE)), "Event JSON-LD missing");
    await shot(d, "event-desktop", false);
    await shot(d, "event-desktop-full", true);
    return `overflow=${await overflow(d)}px`;
  });

  let apiTotal = 0;
  await step("E4", "quote API: 2 regular + 1 VIP priced, promo RIVER10 -10 %, closed → sales_closed, not open → sales_not_started, VIP overflow → sold_out, 11 tickets → max_per_order", null, async () => {
    const ok = await quote(event.id, session.id, [[regular!.id, 2], [vip!.id, 1]]);
    assert(ok.ok && ok.quote, `quote failed: ${ok.error}`);
    assert(ok.quote.quantity === 3 && ok.quote.subtotal === 2 * REGULAR_PRICE + VIP_PRICE && ok.quote.total === ok.quote.subtotal, `quote totals wrong: ${JSON.stringify(ok.quote)}`);
    apiTotal = ok.quote.total;
    const promo = await quote(event.id, session.id, [[regular!.id, 2]], "RIVER10");
    assert(promo.ok && promo.quote?.discount === Math.round(2 * REGULAR_PRICE * 0.1) && promo.quote.promo === "RIVER10", `promo quote wrong: ${JSON.stringify(promo)}`);
    const badPromo = await quote(event.id, session.id, [[regular!.id, 1]], "NOPE");
    assert(!badPromo.ok && badPromo.error === "promo_invalid", `bad promo → ${JSON.stringify(badPromo)}`);
    const closed = await quote(event.id, session.id, [[early!.id, 1]]);
    assert(!closed.ok && closed.error === "sales_closed", `closed type → ${JSON.stringify(closed)}`);
    const notYet = await quote(event.id, session.id, [[door!.id, 1]]);
    assert(!notYet.ok && notYet.error === "sales_not_started", `door type → ${JSON.stringify(notYet)}`);
    const over = await quote(event.id, session.id, [[vip!.id, vipBefore + 1]]);
    assert(!over.ok && (over.error === "sold_out" || over.error === "max_qty"), `VIP ${vipBefore + 1} → ${JSON.stringify(over)}`);
    const tooMany = await quote(event.id, session.id, [[regular!.id, 6], [vip!.id, 5]]);
    assert(!tooMany.ok && (tooMany.error === "max_per_order" || tooMany.error === "max_qty" || tooMany.error === "sold_out"), `11 tickets → ${JSON.stringify(tooMany)}`);
    return `total ${thb(apiTotal)}, promo −${thb(promo.quote!.discount)}, closed/not_started/sold_out/max_per_order refused`;
  });

  let orderId = "";
  let orderKey = "";
  let orderNumber = "";
  await step("E5", "buy widget: 2 Regular + 1 VIP → attendee names → guest contact → summary → ชำระเงิน → /tickets/[id]?k= pending with hold countdown", d, async () => {
    await d.goto(`${ORIGIN}/events/${EVENT_SLUG}`);
    const r = await buyViaPicker(d, { lines: [[regular!.id, 2], [vip!.id, 1]], buyer: BUYER, phone: PHONE, email: "qa-events@example.com", holders: HOLDERS, shots: "buy-desktop" });
    orderId = r.orderId;
    orderKey = r.key;
    assert(r.total === apiTotal, `picker total ${thb(r.total)} ≠ API ${thb(apiTotal)}`);
    await d.getByTestId("order-number").waitFor();
    orderNumber = (await d.getByTestId("order-number").innerText()).match(/TK-\d+/)?.[0] ?? "";
    assert(orderNumber, "order number missing");
    assert((await d.getByTestId("order-status").innerText()).includes("รอชำระเงิน"), "new order should be pending");
    assert((await d.getByTestId("hold-countdown").count()) >= 1, "hold countdown missing");
    assert((await d.getByTestId("order-payment").count()) === 1, "payment panel missing");
    const t = await bodyText(d);
    assert(t.includes(thb(apiTotal)), `total ${thb(apiTotal)} not shown`);
    assert(t.includes(EVENT_TITLE) && t.includes(BUYER), "summary (event / buyer) missing");
    assert((await d.getByTestId("cancel-open").count()) === 1, "cancel button missing while unpaid");
    await shot(d, "order-pending-desktop", true);
    return `${orderNumber} ${orderId} pending ${thb(apiTotal)}`;
  });

  await step("E6", "slip → paid (DEV_AUTO_APPROVE_SLIPS) → 3 e-tickets with QR, holder names, codes, add-to-calendar / share / print", d, async () => {
    assert(orderId, "needs E5");
    await waitText(d, "แนบสลิปโอนเงิน");
    await d.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
    await waitText(d, "ชำระเงินสำเร็จ", 45_000);
    // the panel hands off to successHref ~1.2 s later; let that navigation land before loading the page again
    await d.waitForTimeout(2_500);
    await d.waitForLoadState("networkidle").catch(() => {});
    await d.goto(`${ORIGIN}/tickets/${orderId}?k=${encodeURIComponent(orderKey)}`).catch(async () => {
      await d.waitForTimeout(1_500);
      await d.goto(`${ORIGIN}/tickets/${orderId}?k=${encodeURIComponent(orderKey)}`);
    });
    await d.getByTestId("order-status").waitFor();
    const status = await d.getByTestId("order-status").innerText();
    assert(status.includes("ชำระแล้ว"), `after payment expected ชำระแล้ว, got ${status}`);
    await d.getByTestId("ticket-card").first().waitFor();
    assert((await d.getByTestId("ticket-card").count()) === 3, `expected 3 tickets, got ${await d.getByTestId("ticket-card").count()}`);
    const codes = await d.getByTestId("ticket-code").allInnerTexts();
    assert(codes.length === 3 && codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c.trim())), `ticket codes malformed: ${codes.join(", ")}`);
    const holders = (await d.getByTestId("ticket-holder").allInnerTexts()).map((s) => s.trim());
    for (const h of HOLDERS) assert(holders.includes(h), `holder '${h}' missing (${holders.join(", ")})`);
    const qrs = await d.locator('[data-testid="ticket-card"] img[src^="data:image"]').count();
    assert(qrs === 3, `expected 3 QR images, got ${qrs}`);
    assert((await d.getByTestId("ticket-tools").count()) === 1 && (await d.getByTestId("ics-link").count()) === 1, "ticket tools / ics link missing");
    assert((await d.getByTestId("cancel-open").count()) === 0, "cancel must disappear once paid");
    await shot(d, "order-paid-desktop", true);
    return `${orderNumber} paid, 3 tickets ${codes.map((c) => c.trim()).join(" ")}`;
  });

  await step("E7", ".ics download route returns a calendar with the event, venue and holder count", null, async () => {
    assert(orderId, "needs E5");
    const href = await d.getByTestId("ics-link").getAttribute("href");
    assert(href && href.startsWith(`/tickets/${orderId}/ics`), `unexpected ics href ${href}`);
    const r = await rawGet(href, "text/calendar");
    assert(r.status === 200, `ics → ${r.status}`);
    assert(String(r.headers["content-type"]).includes("text/calendar"), `content-type ${r.headers["content-type"]}`);
    assert(r.body.includes("BEGIN:VCALENDAR") && r.body.includes("BEGIN:VEVENT") && r.body.includes("END:VCALENDAR"), "not an ics file");
    assert(r.body.includes("Riverside Live"), "event title missing from the ics");
    const noKey = await rawGet(`/tickets/${orderId}/ics`, "text/calendar");
    assert(noKey.status >= 400, `ics without key should be refused, got ${noKey.status}`);
    return `${r.body.length} bytes, ${(r.body.match(/BEGIN:VEVENT/g) ?? []).length} VEVENT`;
  });

  await step("E8", "public single-ticket view /tickets/t/[code]: QR + first name only, no phone / e-mail / other holders", d, async () => {
    assert(orderId, "needs E5");
    await d.goto(`${ORIGIN}/tickets/${orderId}?k=${encodeURIComponent(orderKey)}`);
    await d.getByTestId("ticket-card").first().waitFor();
    const link = d.getByTestId("ticket-card").filter({ hasText: "สมหญิง เพื่อนร่วมงาน" }).locator('a[href^="/tickets/t/"]').first();
    await link.waitFor();
    const href = await link.getAttribute("href");
    assert(href, "public ticket link missing");
    await d.goto(`${ORIGIN}${href}`);
    await d.getByTestId("ticket-card").waitFor();
    const t = await bodyText(d);
    const holder = (await d.getByTestId("ticket-holder").innerText()).trim();
    assert(holder === "สมหญิง", `public view should show the first name only, got '${holder}'`);
    assert(!t.includes("สมหญิง เพื่อนร่วมงาน") && !t.includes(PHONE) && !t.includes("qa-events@example.com") && !t.includes("John Tester"), "PII leaked on the public ticket view");
    assert((await d.getByTestId("public-ticket-note").count()) === 1, "public ticket note missing");
    assert((await d.locator('[data-testid="ticket-card"] img[src^="data:image"]').count()) === 1, "QR missing on the public ticket");
    await shot(d, "public-ticket-desktop", false);
    // a typed code (not the signed payload) also resolves; garbage → not found
    const code = (await d.getByTestId("ticket-code").innerText()).trim();
    await d.goto(`${ORIGIN}/tickets/t/${code}`);
    await d.getByTestId("ticket-card").waitFor();
    const bad = await d.goto(`${ORIGIN}/tickets/t/ZZZZ-ZZZZ-ZZZZ`);
    assert(bad?.status() === 404, `unknown code should 404, got ${bad?.status()}`);
    return `first name '${holder}', code ${code}, unknown code 404`;
  });

  await step("E9", "access rules: order page without the key is refused for anonymous visitors; wrong key refused; key works", d, async () => {
    assert(orderId, "needs E5");
    const noKey = await rawGet(`/tickets/${orderId}`, "text/html");
    assert(noKey.status === 404 || noKey.body.includes("ไม่สามารถเปิดคำสั่งซื้อนี้ได้"), `no key → ${noKey.status} should be refused`);
    const wrong = await rawGet(`/tickets/${orderId}?k=wrongkey000000000000`, "text/html");
    assert(wrong.status === 404 || wrong.body.includes("ไม่สามารถเปิดคำสั่งซื้อนี้ได้"), `wrong key → ${wrong.status} should be refused`);
    const okr = await rawGet(`/tickets/${orderId}?k=${encodeURIComponent(orderKey)}`, "text/html");
    assert(okr.status === 200 && okr.body.includes(orderNumber), "key access should work");
    return "anonymous / wrong key refused, key ok";
  });

  let vipAfterBuy = 0;
  await step("E10", "second buyer cannot exceed the remaining VIP quantity (counters, quote API, widget cap)", d, async () => {
    assert(orderId, "needs E5");
    vipAfterBuy = await remainingOf(vip!.id);
    assert(vipAfterBuy === vipBefore - 1, `VIP remaining should drop from ${vipBefore} to ${vipBefore - 1}, got ${vipAfterBuy}`);
    const over = await quote(event.id, session.id, [[vip!.id, vipAfterBuy + 1]]);
    assert(!over.ok && (over.error === "sold_out" || over.error === "max_qty"), `VIP ${vipAfterBuy + 1} → ${JSON.stringify(over)}`);
    const exact = await quote(event.id, session.id, [[vip!.id, Math.min(vipAfterBuy, 10)]]);
    assert(exact.ok, `VIP ${Math.min(vipAfterBuy, 10)} should still quote: ${exact.error}`);
    await d.goto(`${ORIGIN}/events/${EVENT_SLUG}`);
    await d.getByTestId("ticket-picker").waitFor();
    await waitText(d, `เหลือ ${vipAfterBuy} ใบ`);
    const inc = d.getByTestId(`qty-inc-${vip!.id}`);
    const cap = Math.min(vipAfterBuy, 10);
    for (let i = 0; i < cap; i++) await inc.evaluate((el) => (el as HTMLButtonElement).click());
    assert((await d.getByTestId(`qty-${vip!.id}`).innerText()).trim() === String(cap), `widget should reach ${cap} VIP`);
    assert(await inc.isDisabled(), `widget must stop at the remaining ${cap} VIP`);
    return `remaining ${vipBefore} → ${vipAfterBuy}; ${vipAfterBuy + 1} refused by API, widget capped at ${cap}`;
  });

  let order2 = "";
  let key2 = "";
  await step("E11", "unpaid order holds 1 VIP (quote for the rest is refused) → customer cancel releases it (counters + quote)", d, async () => {
    assert(orderId, "needs E5");
    await d.goto(`${ORIGIN}/events/${EVENT_SLUG}`);
    const r = await buyViaPicker(d, { lines: [[vip!.id, 1]], buyer: "ผู้ซื้อคนที่สอง", phone: PHONE2 });
    order2 = r.orderId;
    key2 = r.key;
    await d.getByTestId("order-status").waitFor();
    assert((await d.getByTestId("order-status").innerText()).includes("รอชำระเงิน"), "second order should be pending");
    const held = await remainingOf(vip!.id);
    assert(held === vipAfterBuy - 1, `pending order should hold 1 VIP (${vipAfterBuy} → ${vipAfterBuy - 1}), got ${held}`);
    const refused = await quote(event.id, session.id, [[vip!.id, vipAfterBuy]]);
    assert(!refused.ok && refused.error === "sold_out", `while held, ${vipAfterBuy} VIP should be sold_out: ${JSON.stringify(refused)}`);
    await d.getByTestId("cancel-open").evaluate((el) => (el as HTMLButtonElement).click());
    await d.getByTestId("cancel-confirm").waitFor();
    await d.getByTestId("cancel-confirm").evaluate((el) => (el as HTMLButtonElement).click());
    await d.waitForFunction(() => document.querySelector('[data-testid="order-status"]')?.textContent?.includes("ยกเลิก"), undefined, { timeout: 60_000 });
    assert((await d.getByTestId("cancel-open").count()) === 0 && (await d.getByTestId("order-payment").count()) === 0, "cancelled order must not offer payment / cancel again");
    const released = await remainingOf(vip!.id);
    assert(released === vipAfterBuy, `cancel should release the VIP (${vipAfterBuy - 1} → ${vipAfterBuy}), got ${released}`);
    const again = await quote(event.id, session.id, [[vip!.id, Math.min(vipAfterBuy, 10)]]);
    assert(again.ok, `after cancel ${Math.min(vipAfterBuy, 10)} VIP should quote again: ${again.error}`);
    await shot(d, "order-cancelled-desktop", true);
    return `${order2} held then released; VIP remaining back to ${released}`;
  });

  await step("E12", "OTP login as the buyer → /account links บัตรของฉัน → /account/tickets lists the paid order → owner opens it without a key → history tab", d, async () => {
    assert(orderId, "needs E5");
    await d.goto(`${ORIGIN}/account/login?next=%2Faccount`);
    await d.fill("#otp-target", PHONE);
    await d.locator('form button[type="submit"]').click();
    await d.locator("#otp-code").waitFor({ timeout: 60_000 });
    const code = (await bodyText(d)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    assert(code, "dev OTP code not shown");
    await d.fill("#otp-code", code);
    if (await d.locator("#otp-name").isVisible().catch(() => false)) await d.fill("#otp-name", BUYER);
    await d.locator('form button[type="submit"]').click();
    await d.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
    assert((await bodyText(d)).includes("บัตรของฉัน"), "/account link to tickets missing");
    await d.goto(`${ORIGIN}/account/tickets`);
    await d.getByRole("heading", { level: 1, name: "บัตรของฉัน" }).waitFor();
    const rows = d.getByTestId("order-row");
    assert((await rows.count()) >= 1, "no order rows");
    const t = await bodyText(d);
    assert(t.includes(orderNumber) && t.includes(EVENT_TITLE) && t.includes("ชำระแล้ว"), `${orderNumber} missing from /account/tickets`);
    assert(!t.includes(order2.slice(0, 8)), "another guest's order must not appear");
    await shot(d, "account-tickets-desktop", true);
    await rows.filter({ hasText: orderNumber }).first().click();
    await d.waitForURL(new RegExp(`/tickets/${orderId}`), { timeout: 60_000 });
    await d.getByTestId("ticket-card").first().waitFor();
    assert((await d.getByTestId("ticket-card").count()) === 3, "owner should see the 3 tickets without a key");
    await d.goto(`${ORIGIN}/account/tickets?scope=past`);
    await d.getByRole("heading", { level: 1, name: "บัตรของฉัน" }).waitFor();
    assert((await d.getByTestId("tickets-empty").count()) === 1 || !(await bodyText(d)).includes(orderNumber), "a paid upcoming order must not sit in the history tab");
    return `${orderNumber} listed and opened as the owner`;
  });

  /* ============================== mobile ============================== */
  const { page: m } = await newPage(browser, "mobile", MOBILE);
  await step("M1", "mobile home: hero, countdown, cards, no horizontal overflow", m, async () => {
    await m.goto(`${ORIGIN}/`);
    await m.getByTestId("event-hero").waitFor();
    await shot(m, "home-mobile", false);
    await shot(m, "home-mobile-full", true);
    const o = await overflow(m);
    assert(o <= 1, `horizontal overflow ${o}px`);
    return `overflow=${o}px`;
  });
  await step("M2", "mobile /events", m, async () => {
    await m.goto(`${ORIGIN}/events`);
    await m.getByTestId("events-scope").waitFor();
    await shot(m, "events-mobile", false);
    const o = await overflow(m);
    assert(o <= 1, `horizontal overflow ${o}px`);
    return `overflow=${o}px`;
  });
  await step("M3", "mobile /events/[slug]: sticky buy bar scrolls to the picker; picker usable at 390", m, async () => {
    await m.goto(`${ORIGIN}/events/${EVENT_SLUG}`);
    await m.getByTestId("ticket-picker").waitFor();
    await shot(m, "event-mobile", false);
    const bar = m.getByTestId("buy-bar");
    assert(await bar.isVisible(), "mobile buy bar missing");
    await bar.locator("a, button").first().evaluate((el) => (el as HTMLElement).click());
    await m.waitForTimeout(600);
    const inc = m.getByTestId(`qty-inc-${regular!.id}`);
    await inc.evaluate((el) => (el as HTMLButtonElement).click());
    await inc.evaluate((el) => (el as HTMLButtonElement).click());
    await m.waitForFunction(() => document.querySelector('[data-testid="picker-total"]')?.textContent?.includes("฿"), undefined, { timeout: 20_000 });
    await m.getByTestId("picker-total").scrollIntoViewIfNeeded();
    await shot(m, "buy-mobile", false);
    const o = await overflow(m);
    assert(o <= 1, `horizontal overflow ${o}px`);
    return `overflow=${o}px`;
  });
  await step("M4", "mobile /tickets/[id] paid: tickets stack, QR readable", m, async () => {
    assert(orderId, "needs E5");
    await m.goto(`${ORIGIN}/tickets/${orderId}?k=${encodeURIComponent(orderKey)}`);
    await m.getByTestId("ticket-card").first().waitFor();
    await shot(m, "order-paid-mobile", true);
    const o = await overflow(m);
    assert(o <= 1, `horizontal overflow ${o}px`);
    return `overflow=${o}px`;
  });
  await step("M5", "mobile public ticket + cancelled order views", m, async () => {
    assert(order2, "needs E11");
    await m.goto(`${ORIGIN}/tickets/${order2}?k=${encodeURIComponent(key2)}`);
    await m.getByTestId("order-status").waitFor();
    assert((await m.getByTestId("order-status").innerText()).includes("ยกเลิก"), "cancelled state missing on mobile");
    const o = await overflow(m);
    assert(o <= 1, `horizontal overflow ${o}px`);
    return `overflow=${o}px`;
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
    `## Events customer journey – ${new Date().toISOString()} (guest ${PHONE}, order ${orderNumber || "-"})`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.id} ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${(r.info ?? "").replace(/\|/g, "\\|")} |`),
    "",
    `**${passed} passed, ${failed} failed**`,
    "",
    ...[...consoleErrors].filter(([, e]) => e.length).map(([l, e]) => `Console errors [${l}]:\n${[...new Set(e)].map((x) => `- ${x}`).join("\n")}`),
  ].join("\n");
  await writeFile(path.resolve(process.cwd(), "qa/events-journey-results.md"), md + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
