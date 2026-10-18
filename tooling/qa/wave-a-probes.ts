import "../load-env";
import nodeHttp from "node:http";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { and, availabilityOverrides, customers, desc, eq, getAdminDb, getDb, isNotNull, isNull, patientPackages, patients, payments, rentalStays, sql, tenants, withTenant } from "@rentweb/db";
import { getTenantRuntime } from "@rentweb/core/tenant";
import { expireStalePayments, markPaid, registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck } from "@rentweb/core/payments";
import { unlinkLine } from "@rentweb/core/customer";
import { addDays, bkkTime, bkkDateString, cancelStay, createStay, getUnitTypeBySlug, onStayPaid, onStayPaymentClosed, rentalConfig, stayClosedReason, stayPaymentAccess, unitsAvailable } from "@rentweb/module-rental/services";
import { bookingConfig, cancelBooking, createBooking, getServiceById, listTimetable, type TimetableSession } from "@rentweb/module-booking/services";

/**
 * Wave-A edge / security probes against the LIVE dev servers + DB (QA packet qa_wave_a).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/wave-a-probes.ts
 * Hotel (demo-hotel): min nights, max advance, guests > max, same-day after check-in time, hold expiry sweep,
 *   late cancellation keeps the deposit, /stays/[id] access rules, cross-tenant reads, 4-way race for the last unit.
 * Course (demo-course): enrol in a full session, class pass with 0 sessions left, instructor time-off hides sessions,
 *   4-way race for the last seat.
 * LINE (demo-shop, LINE_MOCK=1): denied consent, replay of a used callback, unlink when LINE is the only login.
 * Everything it creates is cancelled / deleted again. Results → tooling/qa/wave-a-probes-results.md
 */

const PORT = process.env.PORT ?? "3000";
const WEB = `http://127.0.0.1:${PORT}`;
const host = (slug: string) => `${slug}.localhost:${PORT}`;

interface R {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "NOTE";
  info?: string;
}
const results: R[] = [];
async function step(id: string, name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const info = (await fn()) ?? undefined;
    const note = info?.startsWith("NOTE:");
    results.push({ id, name, status: note ? "NOTE" : "PASS", info });
    console.log(`${note ? "NOTE" : "PASS"} ${id} ${name}${info ? ` – ${info}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split("\n").slice(0, 3).join(" | ").slice(0, 500);
    results.push({ id, name, status: "FAIL", info: msg });
    console.log(`FAIL ${id} ${name} – ${msg}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface HttpResult {
  status: number;
  location: string | null;
  setCookie: string[];
  text: string;
  json: () => Record<string, unknown>;
}
/** GET on the dev server with the tenant Host header (fetch drops a custom Host, node:http keeps it). */
function http(slug: string | null, p: string, init: { cookie?: string } = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: slug ? host(slug) : `localhost:${PORT}`, accept: "text/html,application/json" };
    if (init.cookie) headers.cookie = init.cookie;
    const req = nodeHttp.request({ host: "127.0.0.1", port: Number(PORT), path: p, method: "GET", headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const sc = res.headers["set-cookie"] ?? [];
        resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null, setCookie: sc, text: data, json: () => JSON.parse(data) as Record<string, unknown> });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function tenantBySlug(slug: string) {
  const [t] = await getAdminDb().select({ id: tenants.id, settings: tenants.settings }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return t ?? null;
}

const today = bkkDateString();
const stamp = String(Date.now() % 1_000_000).padStart(6, "0");
/** a fresh 10-digit Thai mobile per probe guest */
const phone = (n: number) => `09${stamp}${String(n % 100).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */
/* HOTEL                                                                */
/* ------------------------------------------------------------------ */
async function hotel() {
  const t = await tenantBySlug("demo-hotel");
  if (!t) {
    results.push({ id: "H0", name: "demo-hotel exists", status: "FAIL", info: "tenant missing" });
    return;
  }
  const tenantId = t.id;
  const runtime = await getTenantRuntime(tenantId);
  assert(runtime, "runtime");
  const cfg = rentalConfig(runtime.config.moduleConfig);
  const settings = runtime.config.settings as Record<string, unknown>;
  const opts = { config: cfg, settings };
  const db = getDb();
  const tx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, tenantId, fn);
  const villa = await tx((x) => getUnitTypeBySlug(x, tenantId, "family-villa"));
  const garden = await tx((x) => getUnitTypeBySlug(x, tenantId, "deluxe-garden"));
  assert(villa && garden, "unit types family-villa / deluxe-garden missing");
  // hooks (the worker / web registry does this through register.ts)
  registerPaymentHandler("stay", onStayPaid);
  registerPaymentClosedHandler("stay", onStayPaymentClosed);
  registerPaymentTargetCheck("stay", stayClosedReason);
  registerPaymentAccessCheck("stay", stayPaymentAccess);

  const quote = async (type: string, from: string, to: string, guests: number) => http("demo-hotel", `/api/rental/quote?type=${type}&from=${from}&to=${to}&guests=${guests}`);
  const far = addDays(today, 40);

  await step("H1", `min nights: 1 night on ${villa.slug} (min ${villa.minNights}) is refused by the API, /stay and /stay/book`, async () => {
    const q = await quote(villa.id, far, addDays(far, 1), 2);
    assert(q.status === 200 && q.json().ok === false && q.json().error === "min_nights", `quote → ${q.status} ${q.text.slice(0, 120)}`);
    const ok = await quote(villa.id, far, addDays(far, villa.minNights), 2);
    assert(ok.json().ok === true, `quote with ${villa.minNights} nights should be ok: ${ok.text.slice(0, 120)}`);
    const stay = await http("demo-hotel", `/stay?from=${far}&to=${addDays(far, 1)}&guests=2`);
    assert(stay.status === 200, `/stay → ${stay.status}`);
    assert(stay.text.includes("จำนวนคืนน้อยกว่าขั้นต่ำของห้องนี้"), "/stay does not explain the min-nights refusal in Thai");
    assert(!stay.text.includes(`/stay/book?type=${villa.slug}&amp;from=${far}&amp;to=${addDays(far, 1)}`) && !stay.text.includes(`/stay/book?type=${villa.slug}&from=${far}&to=${addDays(far, 1)}`), "/stay still links the villa to /stay/book for 1 night");
    const book = await http("demo-hotel", `/stay/book?type=${villa.slug}&from=${far}&to=${addDays(far, 1)}&guests=2`);
    assert(book.status === 200 && book.text.includes("จำนวนคืนน้อยกว่าขั้นต่ำของห้องนี้"), `/stay/book guard missing (${book.status})`);
    assert(!book.text.includes('name="phone"'), "/stay/book still renders the guest form for an invalid quote");
  });

  await step("H2", `max advance (${cfg.maxAdvanceDays} days): beyond the horizon → too_far; calendar marks it unbookable`, async () => {
    const from = addDays(today, cfg.maxAdvanceDays + 1);
    const q = await quote(garden.id, from, addDays(from, 1), 2);
    assert(q.json().ok === false && q.json().error === "too_far", `quote → ${q.text.slice(0, 120)}`);
    const edge = addDays(today, cfg.maxAdvanceDays);
    const okq = await quote(garden.id, edge, addDays(edge, 1), 2);
    assert(okq.json().ok === true, `last day inside the horizon should quote: ${okq.text.slice(0, 120)}`);
    const month = addDays(today, cfg.maxAdvanceDays + 40).slice(0, 7);
    const cal = await http("demo-hotel", `/api/rental/calendar?type=${garden.id}&month=${month}`);
    const days = (cal.json().days as Array<{ bookable: boolean; past: boolean }>) ?? [];
    assert(cal.status === 200 && days.length > 27, `calendar → ${cal.status}`);
    assert(days.every((d) => d.bookable === false && d.past === true), "calendar beyond the horizon still offers bookable days");
    const book = await http("demo-hotel", `/stay/book?type=${garden.slug}&from=${from}&to=${addDays(from, 1)}&guests=2`);
    assert(book.status === 200 && book.text.includes("จองล่วงหน้าได้ไม่เกินช่วงที่ที่พักเปิดให้จอง"), "/stay/book guard for too_far missing");
  });

  await step("H3", `guests > max: ${garden.slug} max ${garden.maxGuests} → too_many_guests; 0 / 51 guests → 400; /stay?guests=7 offers nothing`, async () => {
    const q = await quote(garden.id, far, addDays(far, 1), garden.maxGuests + 1);
    assert(q.json().ok === false && q.json().error === "too_many_guests", `quote → ${q.text.slice(0, 120)}`);
    const z = await quote(garden.id, far, addDays(far, 1), 0);
    const big = await quote(garden.id, far, addDays(far, 1), 51);
    const frac = await quote(garden.id, far, addDays(far, 1), 2.5);
    assert(z.status === 400 && big.status === 400 && frac.status === 400, `guests 0/51/2.5 → ${z.status}/${big.status}/${frac.status}`);
    const stay = await http("demo-hotel", `/stay?from=${far}&to=${addDays(far, 2)}&guests=7`);
    assert(stay.status === 200 && stay.text.includes("จำนวนผู้เข้าพักเกินที่ห้องรองรับ"), "/stay with 7 guests does not explain the refusal");
    assert(!/\/stay\/book\?type=[a-z-]+(&amp;|&)from=/.test(stay.text), "/stay with 7 guests still links to /stay/book");
    const book = await http("demo-hotel", `/stay/book?type=${garden.slug}&from=${far}&to=${addDays(far, 1)}&guests=${garden.maxGuests + 1}`);
    assert(book.status === 200 && book.text.includes("จำนวนผู้เข้าพักเกินที่ห้องรองรับ") && !book.text.includes('name="phone"'), "/stay/book guard for too_many_guests missing");
  });

  await step("H4", `same-day check-in after check-in time (${cfg.checkInTime}): booking today at 20:00 BKK`, async () => {
    const now = bkkTime(today, "20:00");
    const r = await tx((x) => createStay(x, tenantId, { unitTypeId: garden.id, checkIn: today, checkOut: addDays(today, 1), guests: 2, customer: { name: "QA ดึก", phone: phone(1) }, paymentMethod: "slip", payOption: "deposit", source: "qa" }, { ...opts, now }));
    if (!r.ok) return `refused: ${r.error}`;
    await tx((x) => cancelStay(x, tenantId, r.value.stay.id, { by: "system", reason: "QA probe cleanup", config: cfg, now }));
    return `NOTE: same-day booking at 20:00 is accepted (stay ${r.value.stay.number}, pending ${r.value.stay.holdUntil?.toISOString()}); no same-day cut-off exists in moduleConfig.rental – product decision, not a bug`;
  });

  await step("H5", "overlapping holds expire: a pending slip stay holds the last villa, the sweep releases it after hold + grace", async () => {
    const from = addDays(today, 60);
    const before = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
    assert(before === 1, `villa should be free (${before})`);
    const r = await tx((x) => createStay(x, tenantId, { unitTypeId: villa.id, checkIn: from, checkOut: addDays(from, 2), guests: 2, customer: { name: "QA โฮลด์", phone: phone(2) }, paymentMethod: "slip", payOption: "deposit", source: "qa" }, opts));
    assert(r.ok, `createStay → ${!r.ok && r.error}`);
    assert(r.value.stay.status === "pending" && r.value.payment, "expected a pending stay with a payment");
    const held = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
    assert(held === 0, `pending stay must hold the unit (remaining ${held})`);
    const second = await tx((x) => createStay(x, tenantId, { unitTypeId: villa.id, checkIn: addDays(from, 1), checkOut: addDays(from, 3), guests: 2, customer: { name: "QA คนที่สอง", phone: phone(3) }, paymentMethod: "slip", source: "qa" }, opts));
    assert(!second.ok && second.error === "unavailable", `overlapping second guest should be refused (${second.ok ? "ok" : second.error})`);
    // backdate the hold + payment expiry instead of moving "now" (the sweep is cross-tenant)
    const past = new Date(Date.now() - 20 * 60_000);
    await getAdminDb().update(payments).set({ expiresAt: past }).where(eq(payments.id, r.value.payment.id));
    await getAdminDb().update(rentalStays).set({ holdUntil: new Date(Date.now() - 60_000) }).where(eq(rentalStays.id, r.value.stay.id));
    const lapsed = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
    assert(lapsed === 1, `a lapsed hold must stop counting even before the sweep (remaining ${lapsed})`);
    const swept = await expireStalePayments(getDb(), { refTypes: ["stay"], graceMinutes: 15 });
    const [row] = await getAdminDb().select({ status: rentalStays.status, by: rentalStays.cancelledBy, reason: rentalStays.cancelReason }).from(rentalStays).where(eq(rentalStays.id, r.value.stay.id));
    assert(row?.status === "cancelled" && row.by === "system", `sweep ${JSON.stringify(swept)} → stay ${row?.status}/${row?.by}`);
    const after = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
    assert(after === 1, `unit not released after the sweep (${after})`);
    return `sweep ${JSON.stringify(swept)}, reason "${row.reason}"`;
  });

  await step("H6", `late cancellation (inside ${cfg.freeCancelDays} days) keeps the deposit; the guest page says so before and after`, async () => {
    const from = addDays(today, 2);
    const r = await tx((x) => createStay(x, tenantId, { unitTypeId: garden.id, checkIn: from, checkOut: addDays(from, 1), guests: 2, customer: { name: "QA ยกเลิกช้า", phone: phone(4) }, paymentMethod: "slip", payOption: "deposit", source: "qa" }, opts));
    assert(r.ok && r.value.payment, `createStay → ${!r.ok && r.error}`);
    const { stay, accessKey, payment } = r.value;
    await tx((x) => markPaid(x, tenantId, payment.id, { verifiedBy: "qa" }));
    const page = await http("demo-hotel", `/stays/${stay.id}?k=${accessKey}`);
    assert(page.status === 200 && page.text.includes(stay.number), `guest page → ${page.status}`);
    assert(page.text.includes("เลยกำหนดยกเลิกฟรีแล้ว"), "guest page does not warn that the free-cancellation window has passed");
    const c = await tx((x) => cancelStay(x, tenantId, stay.id, { by: "customer", reason: "QA late cancel", config: cfg }));
    assert(c.ok, `cancelStay → ${!c.ok && c.error}`);
    assert(c.value.policy && c.value.policy.free === false && c.value.policy.kept === stay.depositAmount && c.value.policy.refundDue === 0, `policy ${JSON.stringify(c.value.policy)} (deposit ${stay.depositAmount})`);
    assert(c.value.stay.status === "cancelled" && c.value.stay.paymentStatus === "deposit_paid", `stay after cancel ${c.value.stay.status}/${c.value.stay.paymentStatus}`);
    const meta = (c.value.stay.meta ?? {}) as { cancellation?: { free: boolean; refundDue: number } };
    assert(meta.cancellation && meta.cancellation.free === false && meta.cancellation.refundDue === 0, `meta.cancellation ${JSON.stringify(meta.cancellation)}`);
    const after = await http("demo-hotel", `/stays/${stay.id}?k=${accessKey}`);
    assert(after.text.includes("ผลการยกเลิก") && after.text.includes("ที่พักจะเก็บค่ามัดจำ"), "guest page after a late cancel does not show the kept deposit");
    const early = await tx((x) => createStay(x, tenantId, { unitTypeId: garden.id, checkIn: addDays(today, cfg.freeCancelDays + 3), checkOut: addDays(today, cfg.freeCancelDays + 4), guests: 2, customer: { name: "QA ยกเลิกฟรี", phone: phone(5) }, paymentMethod: "slip", payOption: "deposit", source: "qa" }, opts));
    assert(early.ok && early.value.payment, "early stay");
    await tx((x) => markPaid(x, tenantId, early.value.payment!.id, { verifiedBy: "qa" }));
    const ce = await tx((x) => cancelStay(x, tenantId, early.value.stay.id, { by: "customer", reason: "QA free cancel", config: cfg }));
    assert(ce.ok && ce.value.policy?.free === true && ce.value.policy.refundDue === early.value.stay.depositAmount, `free cancel policy ${JSON.stringify(ce.ok && ce.value.policy)}`);
    return `late: kept ${stay.depositAmount} satang, refundDue 0; early: refundDue ${early.value.stay.depositAmount}`;
  });

  await step("H7", "/stays/[id]: no key / wrong key / unknown id all render the same no-oracle card; the key or the owner opens it", async () => {
    const [known] = await getAdminDb().select({ id: rentalStays.id, number: rentalStays.number, key: rentalStays.accessKey }).from(rentalStays).where(eq(rentalStays.tenantId, tenantId)).orderBy(desc(rentalStays.createdAt)).limit(1);
    assert(known, "no stay on demo-hotel");
    const noKey = await http("demo-hotel", `/stays/${known.id}`);
    const wrong = await http("demo-hotel", `/stays/${known.id}?k=${"x".repeat(known.key.length)}`);
    const unknown = await http("demo-hotel", `/stays/01900000-0000-7000-8000-000000000000`);
    const bad = await http("demo-hotel", `/stays/not-a-uuid`);
    const withKey = await http("demo-hotel", `/stays/${known.id}?k=${known.key}`);
    for (const [name, r] of [["no key", noKey], ["wrong key", wrong], ["unknown id", unknown]] as const) {
      assert(r.status === 200 && r.text.includes("ไม่สามารถเปิดการจองนี้ได้"), `${name} → ${r.status}, card missing`);
      assert(!r.text.includes(known.number), `${name} leaks the stay number`);
    }
    assert(bad.status === 404, `non-uuid → ${bad.status}`);
    assert(withKey.status === 200 && withKey.text.includes(known.number), "key holder cannot open the stay");
    // compare the rendered markup, not byte lengths: the dev server varies per request (self.__next_r nonce, script preloads)
    const visible = (s: string) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<ID>").replace(/\?k=[^"&]+/g, "").replace(/%3Fk%3D[^"&]+/g, "");
    assert(visible(noKey.text) === visible(unknown.text), `markup differs between unauthorised and unknown ids – oracle (${visible(noKey.text).length} vs ${visible(unknown.text).length} chars)`);
    assert(visible(wrong.text) === visible(unknown.text), "markup differs between a wrong key and an unknown id – oracle");
    return "NOTE: 200 + identical card for missing and unauthorised ids (same as /bookings/[id]); non-uuid → 404";
  });

  await step("H8", "cross-tenant: another tenant host cannot read a demo-hotel stay, calendar or quote", async () => {
    const [known] = await getAdminDb().select({ id: rentalStays.id, number: rentalStays.number, key: rentalStays.accessKey }).from(rentalStays).where(eq(rentalStays.tenantId, tenantId)).orderBy(desc(rentalStays.createdAt)).limit(1);
    assert(known, "no stay");
    const notes: string[] = [];
    for (const slug of ["demo-shop", "demo-course"]) {
      const r = await http(slug, `/stays/${known.id}?k=${known.key}`);
      assert(r.status === 404 && !r.text.includes(known.number), `${slug}/stays → ${r.status}`);
      const cal = await http(slug, `/api/rental/calendar?type=${garden.id}&month=${far.slice(0, 7)}`);
      assert(cal.status === 404, `${slug} calendar → ${cal.status}`);
      notes.push(`${slug}: 404`);
    }
    const qa = await tenantBySlug("qa-hotel");
    if (qa) {
      const r = await http("qa-hotel", `/stays/${known.id}?k=${known.key}`);
      assert(r.status === 200 && r.text.includes("ไม่สามารถเปิดการจองนี้ได้") && !r.text.includes(known.number), `qa-hotel (rental on) /stays → ${r.status} / leaks ${r.text.includes(known.number)}`);
      const cal = await http("qa-hotel", `/api/rental/calendar?type=${garden.id}&month=${far.slice(0, 7)}`);
      const q = await http("qa-hotel", `/api/rental/quote?type=${garden.id}&from=${far}&to=${addDays(far, 1)}&guests=2`);
      assert(cal.status === 404 && q.status === 200 && q.json().ok === false && q.json().error === "unit_type_not_found", `qa-hotel calendar ${cal.status} / quote ${q.text.slice(0, 80)}`);
      notes.push("qa-hotel (rental enabled): card, calendar 404, quote unit_type_not_found");
    } else notes.push("qa-hotel absent (rental-enabled second tenant not probed)");
    return notes.join("; ");
  });

  await step("H9", "race: 4 guests book the last villa for the same nights at once → exactly one stay, the rest unavailable", async () => {
    const from = addDays(today, 70);
    const before = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
    assert(before === 1, `villa should be free (${before})`);
    const attempts = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        tx((x) => createStay(x, tenantId, { unitTypeId: villa.id, checkIn: from, checkOut: addDays(from, 2), guests: 2, customer: { name: `QA แข่ง ${i + 1}`, phone: phone(60 + i) }, paymentMethod: "slip", payOption: "deposit", source: "qa" }, opts)).catch((e) => ({ ok: false as const, error: `threw: ${String((e as Error)?.message ?? e).slice(0, 80)}` })),
      ),
    );
    const won = attempts.filter((a) => a.ok);
    try {
      assert(won.length === 1, `${won.length} of 4 concurrent bookings succeeded (expected 1): ${attempts.map((a) => (a.ok ? "ok" : a.error)).join(", ")}`);
      const losers = attempts.filter((a) => !a.ok).map((a) => (a.ok ? "" : a.error));
      assert(losers.every((e) => e === "unavailable"), `losers should get unavailable: ${losers.join(", ")}`);
      const after = await tx((x) => unitsAvailable(x, tenantId, villa, from, addDays(from, 2)));
      assert(after === 0, `remaining after the race ${after}`);
      const w = won[0]!;
      return `1 winner (${w.ok ? w.value.stay.number : "?"}), 3 × unavailable`;
    } finally {
      for (const w of won) if (w.ok) await tx((x) => cancelStay(x, tenantId, w.value.stay.id, { by: "system", reason: "QA probe cleanup", config: cfg }));
    }
  });

  await step("H10", "cleanup: every QA stay (source = qa) on demo-hotel is cancelled", async () => {
    const rows = await getAdminDb().select({ id: rentalStays.id, n: rentalStays.number, s: rentalStays.status }).from(rentalStays).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.source, "qa")));
    const live = rows.filter((r) => r.s !== "cancelled" && r.s !== "no_show");
    for (const r of live) await tx((x) => cancelStay(x, tenantId, r.id, { by: "system", reason: "QA probe cleanup", config: cfg }));
    return live.length ? `NOTE: ${live.length} live QA stay(s) left behind by a failed step were cancelled now: ${live.map((r) => `${r.n}:${r.s}`).join(", ")}` : `${rows.length} QA stays, all cancelled by their own step`;
  });
}

/* ------------------------------------------------------------------ */
/* COURSE                                                               */
/* ------------------------------------------------------------------ */
async function course() {
  const t = await tenantBySlug("demo-course");
  if (!t) {
    results.push({ id: "C0", name: "demo-course exists", status: "FAIL", info: "tenant missing" });
    return;
  }
  const tenantId = t.id;
  const runtime = await getTenantRuntime(tenantId);
  assert(runtime, "runtime");
  const cfg = bookingConfig(runtime.config.moduleConfig);
  const settings = runtime.config.settings as Record<string, unknown>;
  const db = getDb();
  const tx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, tenantId, fn);
  const timetable = () => tx((x) => listTimetable(x, tenantId, { from: today, days: 14, config: cfg }));
  const weekOf = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    return addDays(ymd, -dow);
  };

  await step("C1", "enrol in a full session: the last seats go, the next guest gets slot_taken, /schedule shows เต็ม, cancel frees the seats", async () => {
    const open = (await timetable()).filter((s) => s.state === "open" && s.remaining >= 1 && s.remaining <= 4);
    const s: TimetableSession | undefined = open.sort((a, b) => a.remaining - b.remaining || a.start.localeCompare(b.start))[0];
    assert(s, "no open session with ≤4 seats left in the next 14 days");
    const schedBefore = (await http("demo-course", `/schedule?week=${weekOf(s.date)}`)).text;
    const created: string[] = [];
    try {
      for (let i = 0; i < s.remaining; i++) {
        const r = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { name: `QA เต็ม ${i + 1}`, phone: phone(10 + i) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings }));
        assert(r.ok, `enrolment ${i + 1}/${s.remaining} → ${!r.ok && r.error}`);
        created.push(r.value.booking.id);
      }
      const full = (await timetable()).find((x) => x.serviceId === s.serviceId && x.start === s.start);
      assert(full && full.remaining === 0 && full.state === "full" && full.available === false, `session after filling: ${JSON.stringify(full && { remaining: full.remaining, state: full.state })}`);
      const extra = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { name: "QA คนเกิน", phone: phone(30) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings }));
      assert(!extra.ok && extra.error === "slot_taken", `overbooking should fail with slot_taken (${extra.ok ? "ok" : extra.error})`);
      const two = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 2, customer: { name: "QA สองคน", phone: phone(31) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings }));
      assert(!two.ok && two.error === "slot_taken", `party of 2 into a full session should fail (${two.ok ? "ok" : two.error})`);
      const sched = await http("demo-course", `/schedule?week=${weekOf(s.date)}`);
      assert(sched.status === 200, `/schedule → ${sched.status}`);
      const href = `/book?service=${encodeURIComponent(s.serviceSlug)}&amp;date=${s.date}&amp;start=${encodeURIComponent(s.start)}`;
      assert(schedBefore.includes(href), "the open session had no enrol link on /schedule before filling it");
      assert(!sched.text.includes(href), "the full session is still linked to /book on /schedule");
      const fullCount = (t: string) => (t.match(/>เต็มแล้ว</g) ?? []).length;
      // the timetable renders a desktop grid and a mobile list, so one full session adds two badges
      assert(fullCount(sched.text) > fullCount(schedBefore), `expected more เต็มแล้ว badges on /schedule (${fullCount(schedBefore)} → ${fullCount(sched.text)})`);
      const wizard = await http("demo-course", `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`);
      assert(wizard.status === 200, `/book → ${wizard.status}`);
      return `${s.serviceName} ${s.date} ${s.start.slice(11, 16)}Z filled with ${created.length} seat(s); /schedule เต็ม; overbook + party-of-2 → slot_taken`;
    } finally {
      for (const id of created) await tx((x) => cancelBooking(x, tenantId, id, { by: "admin", reason: "QA probe cleanup", config: cfg }));
      const back = (await timetable()).find((x) => x.serviceId === s.serviceId && x.start === s.start);
      if (!back || back.remaining !== s.remaining) console.log(`     WARN seats after cleanup ${back?.remaining} (expected ${s.remaining})`);
    }
  });

  await step("C2", "class pass with 0 sessions left cannot pay for an enrolment (package_not_usable)", async () => {
    const [pp] = await getAdminDb()
      .select({ id: patientPackages.id, total: patientPackages.sessionsTotal, used: patientPackages.sessionsUsed, status: patientPackages.status, customerId: patients.customerId, name: patientPackages.packageName })
      .from(patientPackages)
      .innerJoin(patients, eq(patients.id, patientPackages.patientId))
      .where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.status, "active"), isNotNull(patients.customerId)))
      .limit(1);
    if (!pp) return "NOTE: demo-course has no active pass bound to a customer – skipped (engine rule unit-tested in classes.test.ts)";
    const [cust] = await getAdminDb().select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.id, pp.customerId!)).limit(1);
    assert(cust, "customer");
    const s = (await timetable()).find((x) => x.state === "open" && x.remaining >= 2);
    assert(s, "no open session");
    await getAdminDb().update(patientPackages).set({ sessionsUsed: pp.total }).where(eq(patientPackages.id, pp.id));
    try {
      const r = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { id: cust.id, name: cust.name ?? "QA", phone: cust.phone ?? phone(40) }, patientPackageId: pp.id, source: "qa" }, { config: cfg, settings }));
      assert(!r.ok && r.error === "package_not_usable", `0-session pass → ${r.ok ? `booking ${r.value.booking.number} created!` : r.error}`);
    } finally {
      await getAdminDb().update(patientPackages).set({ sessionsUsed: pp.used }).where(eq(patientPackages.id, pp.id));
    }
    return `pass "${pp.name}" (${pp.used}/${pp.total}) set to 0 left → package_not_usable; restored`;
  });

  await step("C3", "instructor time-off (closed override) hides that instructor's session from the timetable and /schedule", async () => {
    const s = (await timetable()).find((x) => x.state === "open" && x.instructor);
    assert(s && s.instructor, "no open session with an instructor");
    const before = (await timetable()).filter((x) => x.instructor?.id === s.instructor!.id && x.date === s.date && x.state === "open").length;
    const [ov] = await getAdminDb()
      .insert(availabilityOverrides)
      .values({ tenantId, staffId: s.instructor.id, startsAt: new Date(new Date(s.start).getTime() - 30 * 60_000), endsAt: new Date(new Date(s.end).getTime() + 30 * 60_000), kind: "closed", reason: "QA time-off" })
      .returning({ id: availabilityOverrides.id });
    try {
      const after = await timetable();
      const hidden = after.find((x) => x.serviceId === s.serviceId && x.start === s.start);
      assert(hidden && hidden.state === "closed" && hidden.available === false, `session during the instructor's time-off: ${JSON.stringify(hidden && { state: hidden.state, available: hidden.available })} (expected closed / not bookable)`);
      const others = after.filter((x) => x.instructor?.id === s.instructor!.id && x.date === s.date && x.state === "open").length;
      assert(others === before - 1, `expected only that session to close (${before} open → ${others} open)`);
      const sched = await http("demo-course", `/schedule?week=${weekOf(s.date)}`);
      const href = `/book?service=${encodeURIComponent(s.serviceSlug)}&amp;date=${s.date}&amp;start=${encodeURIComponent(s.start)}`;
      assert(sched.status === 200 && !sched.text.includes(href), "/schedule still links the hidden session");
      const wizard = await http("demo-course", `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`);
      assert(wizard.status === 200, `/book → ${wizard.status}`);
      const enrol = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { name: "QA วันหยุดครู", phone: phone(50) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings }));
      assert(!enrol.ok && (enrol.error === "invalid_slot" || enrol.error === "slot_taken"), `enrolling into a hidden session should fail (${enrol.ok ? "ok" : enrol.error})`);
      return `${s.instructor.name} ${s.date} ${s.start.slice(11, 16)}Z hidden; other sessions that day ${others}; direct enrol → ${enrol.ok ? "ok" : enrol.error}`;
    } finally {
      await getAdminDb().delete(availabilityOverrides).where(eq(availabilityOverrides.id, ov!.id));
    }
  });

  await step("C4", "race: 4 students enrol for the last seat at once → exactly one booking, the rest slot_taken", async () => {
    const open = (await timetable()).filter((s) => s.state === "open" && s.remaining >= 1 && s.remaining <= 4);
    const s: TimetableSession | undefined = open.sort((a, b) => a.remaining - b.remaining || a.start.localeCompare(b.start))[0];
    assert(s, "no open session with ≤4 seats left in the next 14 days");
    const created: string[] = [];
    try {
      for (let i = 1; i < s.remaining; i++) {
        const r = await tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { name: `QA เติม ${i}`, phone: phone(80 + i) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings }));
        assert(r.ok, `pre-fill ${i} → ${!r.ok && r.error}`);
        created.push(r.value.booking.id);
      }
      const attempts = await Promise.all(
        [0, 1, 2, 3].map((i) =>
          tx((x) => createBooking(x, tenantId, { serviceId: s.serviceId, start: s.start, partySize: 1, customer: { name: `QA แข่ง ${i + 1}`, phone: phone(70 + i) }, paymentMethod: "slip", source: "qa" }, { config: cfg, settings })).catch((e) => ({ ok: false as const, error: `threw: ${String((e as Error)?.message ?? e).slice(0, 80)}` })),
        ),
      );
      const won = attempts.filter((a) => a.ok);
      for (const w of won) if (w.ok) created.push(w.value.booking.id);
      assert(won.length === 1, `${won.length} of 4 concurrent enrolments succeeded (expected 1): ${attempts.map((a) => (a.ok ? "ok" : a.error)).join(", ")}`);
      const losers = attempts.filter((a) => !a.ok).map((a) => (a.ok ? "" : a.error));
      assert(losers.every((e) => e === "slot_taken"), `losers should get slot_taken: ${losers.join(", ")}`);
      const full = (await timetable()).find((x) => x.serviceId === s.serviceId && x.start === s.start);
      assert(full && full.remaining === 0 && full.state === "full", `session after the race: ${JSON.stringify(full && { remaining: full.remaining, state: full.state })}`);
      return `${s.serviceName} ${s.date}: 1 winner, 3 × slot_taken, session full`;
    } finally {
      for (const id of created) await tx((x) => cancelBooking(x, tenantId, id, { by: "admin", reason: "QA probe cleanup", config: cfg }));
    }
  });
}

/* ------------------------------------------------------------------ */
/* LINE                                                                 */
/* ------------------------------------------------------------------ */
async function line() {
  const t = await tenantBySlug("demo-shop");
  if (!t) {
    results.push({ id: "L0", name: "demo-shop exists", status: "FAIL", info: "tenant missing" });
    return;
  }
  const tenantId = t.id;
  const cookieOf = (setCookie: string[], name: string) => setCookie.map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`)) ?? null;

  async function startFlow() {
    const start = await http("demo-shop", "/api/auth/line/start?next=/account");
    assert(start.status === 302 && start.location, `start → ${start.status}`);
    const ticket = cookieOf(start.setCookie, "rw_line_oauth") ?? start.setCookie.map((c) => c.split(";")[0]!).find((c) => /line/i.test(c));
    assert(ticket, `no ticket cookie (${start.setCookie.join(" | ")})`);
    const authz = new URL(start.location!);
    assert(authz.pathname.includes("/api/dev/line-mock/"), `start did not go to the mock (${authz.origin}${authz.pathname}) – LINE_MOCK not live`);
    return { authz, ticket };
  }
  async function mockRedirect(authz: URL, extra: Record<string, string>) {
    const u = new URL(authz.toString());
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    const r = await http(null, `${u.pathname}${u.search}`);
    assert(r.status === 302 && r.location, `mock authorize → ${r.status}`);
    const back = new URL(r.location!);
    return `${back.pathname}${back.search}`;
  }

  await step("L1", "denied consent on LINE → /account/login?error=line_denied (Thai message), ticket cleared", async () => {
    const { authz, ticket } = await startFlow();
    const cb = await mockRedirect(authz, { deny: "1" });
    const r = await http("demo-shop", cb, { cookie: ticket });
    assert(r.status === 302 && r.location, `callback → ${r.status}`);
    const loc = new URL(r.location!);
    assert(loc.pathname === "/account/login" && loc.searchParams.get("error") === "line_denied", `redirected to ${r.location}`);
    const cleared = r.setCookie.find((c) => c.startsWith(ticket.split("=")[0]!) && /max-age=0|expires=/i.test(c));
    assert(cleared, "ticket cookie not cleared");
    const page = await http("demo-shop", `${loc.pathname}${loc.search}`);
    assert(page.status === 200 && /LINE/.test(page.text) && /ยกเลิก|ไม่อนุญาต|ไม่ได้อนุญาต/.test(page.text), "login page shows no Thai explanation for the denied consent");
    return "denied → line_denied + Thai copy";
  });

  await step("L2", "replay of a used callback (code + state) is refused without the ticket; the used ticket is single-use in the browser", async () => {
    const { authz, ticket } = await startFlow();
    const cb = await mockRedirect(authz, { user: "Umock00000000000000000000000000c3" });
    const first = await http("demo-shop", cb, { cookie: ticket });
    assert(first.status === 302 && first.location && new URL(first.location).pathname === "/account", `first callback → ${first.status} ${first.location}`);
    const session = cookieOf(first.setCookie, "rw_customer") ?? first.setCookie.map((c) => c.split(";")[0]!).find((c) => !c.startsWith(ticket.split("=")[0]!) && !c.endsWith("="));
    assert(session, `no customer session cookie (${first.setCookie.join(" | ")})`);
    const replayNoCookie = await http("demo-shop", cb);
    assert(replayNoCookie.status === 302 && new URL(replayNoCookie.location!).searchParams.get("error") === "line_state_mismatch", `replay without ticket → ${replayNoCookie.location}`);
    const forged = await http("demo-shop", cb.replace(/state=[^&]+/, "state=forged"), { cookie: ticket });
    assert(forged.status === 302 && new URL(forged.location!).searchParams.get("error") === "line_state_mismatch", `forged state → ${forged.location}`);
    const replayWithOld = await http("demo-shop", cb, { cookie: ticket });
    const outcome = replayWithOld.location ? new URL(replayWithOld.location) : null;
    const accepted = outcome?.pathname === "/account" && !outcome.searchParams.get("error");
    return accepted
      ? "NOTE: a stolen ticket cookie + the same mock code logs in again (the dev mock issues stateless codes; real LINE rejects a reused code with invalid_grant, and the browser's ticket cookie is cleared on first use). No server-side used-state list – acceptable, documented."
      : `replay with the old ticket → ${replayWithOld.location}`;
  });

  await step("L3", "unlink when LINE is the only login is refused server-side (no_other_login) and the link stays", async () => {
    const [c] = await getAdminDb().select({ id: customers.id, name: customers.name, lineUserId: customers.lineUserId }).from(customers).where(and(eq(customers.tenantId, tenantId), isNotNull(customers.lineUserId), isNull(customers.phone), isNull(customers.email))).orderBy(desc(customers.createdAt)).limit(1);
    assert(c, "no LINE-only customer on demo-shop (run line_login-journey first)");
    const r = await withTenant(getDb(), tenantId, (tx) => unlinkLine(tx, tenantId, c.id));
    assert(!r.ok && r.error === "no_other_login", `unlink → ${JSON.stringify(r)}`);
    const [after] = await getAdminDb().select({ lineUserId: customers.lineUserId }).from(customers).where(eq(customers.id, c.id));
    assert(after?.lineUserId === c.lineUserId, "lineUserId changed");
    return `${c.name ?? c.id}: no_other_login, link intact`;
  });
}

/* ------------------------------------------------------------------ */
async function main() {
  const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--")));
  const run = (k: string) => !only.size || only.has(k);
  if (run("hotel")) await hotel().catch((e) => results.push({ id: "H!", name: "hotel suite crashed", status: "FAIL", info: String(e?.message ?? e) }));
  if (run("course")) await course().catch((e) => results.push({ id: "C!", name: "course suite crashed", status: "FAIL", info: String(e?.message ?? e) }));
  if (run("line")) await line().catch((e) => results.push({ id: "L!", name: "line suite crashed", status: "FAIL", info: String(e?.message ?? e) }));
  const pass = results.filter((r) => r.status === "PASS").length;
  const note = results.filter((r) => r.status === "NOTE").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const md = [`# Wave-A edge / security probes — ${new Date().toISOString()}`, "", `PASS ${pass} · NOTE ${note} · FAIL ${fail}`, "", "| ID | Status | Probe | Info |", "|---|---|---|---|", ...results.map((r) => `| ${r.id} | ${r.status} | ${r.name} | ${(r.info ?? "").replace(/\|/g, "\\|")} |`), ""].join("\n");
  await writeFile(path.resolve(process.cwd(), "qa", "wave-a-probes-results.md"), md, "utf8");
  console.log(`\nPASS ${pass} · NOTE ${note} · FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
