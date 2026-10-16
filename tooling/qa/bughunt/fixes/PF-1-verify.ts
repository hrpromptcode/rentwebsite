/**
 * PF-1 (payments follow-up "storefront", SEC-009 hardening): PaymentPanel sends the page's proof explicitly —
 * slip upload: form fields k / p; status poll: x-access-key header / ?p= — instead of relying on the Referer.
 * Every /api/payments/* request in the browser has its Referer removed by a Playwright route. Checks, for a guest
 *   - order       /orders/<id>?k=<key>            (sec-u1shop, via the real checkout action)
 *   - booking     /bookings/<id>?k=<key>          (demo-salon, deposit service, created via the booking service)
 *   - reservation /reservations/<number>?p=<phone> (demo-restaurant, slip deposit, created via the restaurant service)
 * that (0) a proof-less request from the same page is refused once the Referer is stripped (control: the strip works),
 * (1) the panel's own status poll returns 200 and carries the proof, (2) a slip chosen in the panel's file input is
 * accepted (200) with the proof in the form, and the payment moves on (key = strong -> auto-approved in dev; phone =
 * weak -> pending_verification). Booking / reservation are cancelled again at the end.
 * Run from tooling/:  npx tsx qa/bughunt/fixes/PF-1-verify.ts
 */
import { chromium, type BrowserContext, type Request } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
import { done, tenantIdOf, tt } from "../correctness-lib";
import { and, eq, tenantModules, tenants } from "@rentweb/db";
import { markFailed } from "../../../../packages/core/src/payments/index";
import { addDays, bookingConfig, cancelBooking, createBooking, getServiceBySlug, getSlotsForDate, toBkkParts, toSlotService, ymdToString } from "../../../../packages/modules/booking/src/services/index";
import { cancelReservation, createReservation } from "../../../../packages/modules/restaurant/src/services/index";
// @ts-expect-error plain .mjs helper
import { WEB, db as rawDb, actionId, callWebAction } from "../security-http.mjs";

const sql = rawDb();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABVKJPPgAAAABJRU5ErkJggg==", "base64");
let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};

interface Case {
  url: string;
  paymentId: string;
  proof: "k" | "p";
  strong: boolean;
}

async function guestOrder(): Promise<Case> {
  const host = "sec-u1shop.localhost:3000";
  const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
  const [p] = await sql`select id from products where tenant_id=${t.id} and status='active' and has_variants=false and (track_inventory=false or stock > 5) order by created_at limit 1`;
  const [m] = await sql`select id from shipping_methods where tenant_id=${t.id} and active=true order by type='pickup' desc limit 1`;
  const add = await fetch(`${WEB}/api/cart`, { method: "POST", headers: { "x-forwarded-host": host, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
  const cartCookie = (add.headers.getSetCookie() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  const form = { name: "QA PF-1", phone: "0890001101", email: "", shippingMethodId: m.id, paymentMethod: "slip", note: "", line1: "x", subdistrict: "x", district: "x", province: "กรุงเทพมหานคร", postalCode: "10110" };
  const o = await callWebAction(host, cartCookie, actionId("placeOrderAction", "checkout"), [t.id, {}, "$K1"], "/checkout", form);
  const orderId = o.location?.match(/\/orders\/([0-9a-f-]{36})/)?.[1] as string;
  if (!orderId) throw new Error(`checkout failed: ${o.status} ${String(o.text).slice(0, 200)}`);
  const [order] = await sql`select metadata from orders where id=${orderId}`;
  const [pay] = await sql`select id from payments where ref_id=${orderId} order by created_at desc limit 1`;
  return { url: `http://${host}/orders/${orderId}?k=${order.metadata.accessKey}`, paymentId: pay.id as string, proof: "k", strong: true };
}

async function guestBooking(): Promise<Case & { cleanup: () => Promise<unknown> }> {
  const t = await tenantIdOf("demo-salon");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s as Record<string, unknown>);
  const mc = await tt(t, async (tx) => (await tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, t), eq(tenantModules.moduleKey, "booking"))))[0]?.c ?? {});
  const config = bookingConfig({ booking: mc as Record<string, unknown> });
  const svc = (await tt(t, (tx) => getServiceBySlug(tx, t, "aroma-90")))!;
  const today = toBkkParts(new Date());
  for (let i = 9; i < 30; i++) {
    const slots = await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(svc), date: ymdToString(addDays(today, i)), config }));
    const s = slots.find((x) => x.available);
    if (!s) continue;
    const r = await tt(t, (tx) => createBooking(tx, t, { serviceId: svc.id, start: s.start, customer: { name: "QA PF-1", phone: "0890001102" }, paymentMethod: "slip" }, { config, settings }));
    if (!r.ok) throw new Error(`booking failed: ${r.error}`);
    const v = r.value;
    if (!v.payment) throw new Error("booking has no deposit payment");
    const cleanup = () => tt(t, (tx) => cancelBooking(tx, t, v.booking.id, { by: "admin", reason: "QA PF-1 cleanup", config }));
    return { url: `http://demo-salon.localhost:3000/bookings/${v.booking.id}?k=${v.accessKey}`, paymentId: v.payment.id, proof: "k", strong: true, cleanup };
  }
  throw new Error("no free aroma-90 slot");
}

async function guestReservation(): Promise<Case & { cleanup: () => Promise<unknown> }> {
  const t = await tenantIdOf("demo-restaurant");
  const day = addDays(toBkkParts(new Date()), 11);
  const startsAt = new Date(`${ymdToString(day)}T18:00:00+07:00`);
  const r = await tt(t, (tx) => createReservation(tx, t, { name: "QA PF-1", phone: "0890001103", partySize: 2, startsAt, depositAmount: 10000, paymentMethod: "slip" }));
  if (!r.ok) throw new Error(`reservation failed: ${r.error}`);
  const v = r.value;
  const pay = v.payment!;
  const cleanup = async () => {
    await tt(t, (tx) => markFailed(tx, t, pay.id, "QA PF-1 cleanup")).catch(() => {});
    await tt(t, (tx) => cancelReservation(tx, t, v.reservation.id, "QA PF-1 cleanup", { by: "staff" }));
  };
  return { url: `http://demo-restaurant.localhost:3000/reservations/${encodeURIComponent(v.reservation.number)}?p=${encodeURIComponent(v.reservation.phone)}`, paymentId: pay.id, proof: "p", strong: false, cleanup };
}

const browser = await chromium.launch();

async function runCase(name: string, c: Case) {
  const ctx: BrowserContext = await browser.newContext();
  await isolateHmr(ctx);
  let seen = 0;
  let withReferer = 0;
  // Two independent strips: the page gets a strict <meta name="referrer" content="no-referrer"> (what a site/extension
  // policy does), and every /api/payments request is re-issued by Playwright without a Referer header
  // (route.continue() cannot drop it in Chromium — the network stack re-adds it — so the request is fetched + fulfilled).
  await ctx.addInitScript(() => {
    const add = () => {
      const m = document.createElement("meta");
      m.name = "referrer";
      m.content = "no-referrer";
      document.head.prepend(m);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  });
  await ctx.route(/\/api\/payments\//, async (route) => {
    const req = route.request();
    const h: Record<string, string> = { ...(await req.allHeaders()) };
    seen++;
    if (h.referer) withReferer++;
    delete h.referer;
    // Node cannot resolve *.localhost: send to 127.0.0.1:3000 with the tenant Host header
    const u = new URL(req.url());
    h.host = u.host;
    const res = await route.fetch({ url: `http://127.0.0.1:3000${u.pathname}${u.search}`, headers: h, maxRedirects: 0 });
    await route.fulfill({ response: res });
  });
  const page = await ctx.newPage();
  const isPoll = (r: Request) => r.method() === "GET" && new URL(r.url()).pathname.endsWith(`/api/payments/${c.paymentId}`);
  const isSlip = (r: Request) => r.method() === "POST" && r.url().includes(`/api/payments/${c.paymentId}/slip`);
  try {
    let loaded = false;
    for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
      const res = await page.goto(c.url, { waitUntil: "load", timeout: 120_000 });
      loaded = !!res && res.status() < 500 && (await page.locator('input[type="file"]').count()) > 0;
      if (!loaded) await page.waitForTimeout(10_000);
    }
    check(`${name}: page renders the PaymentPanel`, loaded, c.url.replace(/([?&][kp]=)[^&]+/, "$1…"));
    if (!loaded) return;

    // (0) control: the old panel request (no explicit proof) from this very page, with the Referer stripped
    const control = await page.evaluate(async (id) => (await fetch(`/api/payments/${id}`, { cache: "no-store" })).status, c.paymentId);
    check(`${name}: control — proof-less poll with Referer stripped is refused`, control === 404, `status ${control}`);

    // (1) the panel's own poll
    const pollReq = await page.waitForRequest(isPoll, { timeout: 30_000 });
    const pollRes = await pollReq.response();
    const pollProof = c.proof === "k" ? !!pollReq.headers()["x-access-key"] : new URL(pollReq.url()).searchParams.has("p");
    check(`${name}: panel poll carries the proof (${c.proof === "k" ? "x-access-key header" : "?p="}) and gets 200`, pollProof && pollRes?.status() === 200, `status ${pollRes?.status()}`);

    // (2) slip through the panel's file input
    const [slipReq] = await Promise.all([
      page.waitForRequest(isSlip, { timeout: 30_000 }),
      page.locator('input[type="file"]').first().setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG }),
    ]);
    const slipRes = await slipReq.response();
    const body = slipReq.postDataBuffer()?.toString("latin1") ?? "";
    const formProof = body.includes(`name="${c.proof}"`);
    const [after] = await sql`select status from payments where id=${c.paymentId}`;
    const want = c.strong ? "paid" : "pending_verification";
    check(`${name}: slip upload carries form field "${c.proof}", 200, payment ${want}`, formProof && slipRes?.status() === 200 && after.status === want, `status ${slipRes?.status()}, payment ${after.status}`);
    check(`${name}: /api/payments requests went out without Referer`, seen > 0, `${seen} requests, ${withReferer} still had one in the browser and were re-issued without it`);
  } finally {
    await ctx.close();
  }
}

const cleanups: Array<() => Promise<unknown>> = [];
try {
  await runCase("order (?k=)", await guestOrder());
  const b = await guestBooking();
  cleanups.push(b.cleanup);
  await runCase("booking (?k=)", b);
  const r = await guestReservation();
  cleanups.push(r.cleanup);
  await runCase("reservation (?p=)", r);
} catch (e) {
  failures++;
  console.log(`FAIL ${(e as Error).message}`);
} finally {
  for (const c of cleanups) await c().catch((e: Error) => console.log(`cleanup: ${e.message}`));
  await browser.close();
  await sql.end();
  await done();
}
console.log(failures ? `FAIL (${failures})` : "PASS all");
process.exit(failures ? 1 : 0);
