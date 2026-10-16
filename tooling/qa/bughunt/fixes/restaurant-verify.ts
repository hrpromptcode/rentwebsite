/**
 * Restaurant packet – end-to-end checks against the real dev DB + running storefront (localhost:3000).
 * Run from tooling/: npx tsx qa/bughunt/fixes/restaurant-verify.ts   (prints PASS/FAIL per check)
 *  COR-07/SBR-005  stale bill QR is void after a new round; the new QR charges the full due; paying it pays all
 *  COR-26          8 parallel QR scans → one open session (+ unique index exists)
 *  SBR-006         a session idle since yesterday is not joined by the next scan (/t/<qr>)
 *  COR-10          3 parallel reservations for a one-table zone → exactly one accepted
 *  SBR-013/014     zone-less bookings count against a zone; a party of 40 is refused for a 4x6 zone
 *  COR-34          cancelling a reservation voids its deposit QR (late slip → 409)
 *  COR-22          malformed restaurant ids → 4xx, never 500
 */
import { done, hreq, multipart, plat, tenantIdOf, tt } from "../correctness-lib";
import { and, eq, inArray, sql, tenants, diningTables, menuItems, payments, reservations, restaurantOrders, tableSessions } from "@rentweb/db";
import { registerPaymentClosedHandler, registerPaymentHandler, resolvePromptpayId } from "@rentweb/core/payments";
import {
  bangkokDate,
  addDays,
  bangkokParts,
  cancelReservation,
  checkAvailability,
  createOrder,
  createReservation,
  onReservationPaid,
  onReservationPaymentClosed,
  onRestaurantOrderPaid,
  onRestaurantPaymentClosed,
  openOrGetSession,
  sessionSummary,
} from "../../../../packages/modules/restaurant/src/services/index";

registerPaymentHandler("rest_order", onRestaurantOrderPaid);
registerPaymentHandler("reservation", onReservationPaid);
registerPaymentClosedHandler("rest_order", onRestaurantPaymentClosed);
registerPaymentClosedHandler("reservation", onReservationPaymentClosed);

const HOST = "demo-restaurant.localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};

async function main() {
  const t = await tenantIdOf("demo-restaurant");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const promptpayId = resolvePromptpayId(settings as Record<string, unknown>);
  const tag = Date.now().toString(36).toUpperCase().slice(-5);
  const items = await tt(t, (tx) =>
    tx
      .select({ id: menuItems.id, price: menuItems.price })
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, t), eq(menuItems.available, true), eq(menuItems.soldOut, false)))
      .limit(40),
  );
  const mkTable = (name: string, zone: string | null = null, seats = 4, active = true) =>
    tt(t, async (tx) => (await tx.insert(diningTables).values({ tenantId: t, name: `${name} ${tag}`, zone, seats, active, qrToken: `qa${name.toLowerCase().replace(/[^a-z0-9]/g, "")}${tag.toLowerCase()}${Math.random().toString(36).slice(2, 6)}` }).returning())[0]!);
  const round = async (sessionId: string) => {
    for (const it of items) {
      const r = await tt(t, (tx) => createOrder(tx, t, { type: "dine_in", sessionId, items: [{ menuItemId: it.id, qty: 1, modifierIds: [] }] }));
      if (r.ok) return r.value.order;
    }
    throw new Error("no orderable item");
  };
  const created: { tables: string[]; reservations: string[] } = { tables: [], reservations: [] };

  /* ── COR-07 / SBR-005 ── */
  {
    const table = await mkTable("QA-BILL", null, 4, false);
    created.tables.push(table.id);
    const { session } = await tt(t, (tx) => openOrGetSession(tx, t, table.id));
    const cookie = { cookie: `rw_table=${session.token}` };
    const o1 = await round(session.id);
    const billRes = await hreq(HOST, `/api/restaurant/session/${session.token}/call`, { method: "POST", headers: { "content-type": "application/json", ...cookie }, body: JSON.stringify({ kind: "bill", method: "promptpay_qr" }) });
    const bill1 = JSON.parse(billRes.body) as { ok: boolean; session?: { payment: { id: string; amount: number } | null; dueTotal: number } };
    check("COR-07 bill QR issued for round 1", billRes.status === 200 && bill1.session?.payment?.amount === o1.total, { status: billRes.status, amount: bill1.session?.payment?.amount, o1: o1.total });
    const o2 = await round(session.id);
    const m = multipart("slip", "slip.png", "image/png", PNG);
    const stale = await hreq(HOST, `/api/payments/${bill1.session!.payment!.id}/slip`, { method: "POST", headers: { "content-type": m.contentType, "content-length": String(m.body.length), ...cookie }, body: m.body });
    check("COR-07 slip on the stale QR is refused (409)", stale.status === 409, `${stale.status} ${stale.body.slice(0, 80)}`);
    const mid = await tt(t, (tx) => sessionSummary(tx, t, session.id));
    check("COR-07 nothing paid by the stale QR, session open, due = both rounds", mid!.paidTotal === 0 && mid!.dueTotal === o1.total + o2.total && mid!.session.status === "open", { status: mid!.session.status, paid: mid!.paidTotal, due: mid!.dueTotal });
    const billRes2 = await hreq(HOST, `/api/restaurant/session/${session.token}/call`, { method: "POST", headers: { "content-type": "application/json", ...cookie }, body: JSON.stringify({ kind: "bill", method: "promptpay_qr" }) });
    const bill2 = JSON.parse(billRes2.body) as { session?: { payment: { id: string; amount: number } | null; dueTotal: number } };
    check("SBR-005 the bill sheet and the QR charge the same amount", bill2.session?.payment?.amount === bill2.session?.dueTotal && bill2.session?.dueTotal === o1.total + o2.total, { qr: bill2.session?.payment?.amount, due: bill2.session?.dueTotal });
    const m2 = multipart("slip", "slip.png", "image/png", PNG);
    const ok = await hreq(HOST, `/api/payments/${bill2.session!.payment!.id}/slip`, { method: "POST", headers: { "content-type": m2.contentType, "content-length": String(m2.body.length), ...cookie }, body: m2.body });
    const end = await tt(t, (tx) => sessionSummary(tx, t, session.id));
    check("COR-07 paying the current QR pays every round, session paid", ok.status === 200 && end!.session.status === "paid" && end!.dueTotal === 0 && end!.orders.every((o) => o.paymentStatus === "paid"), { slip: ok.status, status: end!.session.status, due: end!.dueTotal });
  }

  /* ── COR-26 ── */
  {
    const table = await mkTable("QA-PAR", null, 4, false);
    created.tables.push(table.id);
    await Promise.all(Array.from({ length: 8 }, () => tt(t, (tx) => tx.select({ id: diningTables.id }).from(diningTables).limit(1))));
    const res = await Promise.all(Array.from({ length: 8 }, () => tt(t, (tx) => openOrGetSession(tx, t, table.id)).catch((e: Error) => ({ error: e.message }))));
    const open = await tt(t, (tx) => tx.select({ id: tableSessions.id }).from(tableSessions).where(and(eq(tableSessions.tenantId, t), eq(tableSessions.tableId, table.id), inArray(tableSessions.status, ["open", "bill_requested"]))));
    const ids = new Set(res.map((r) => ("session" in r ? r.session.id : r.error)));
    check("COR-26 8 parallel scans → 1 open session, every scan joins it", open.length === 1 && ids.size === 1, { open: open.length, distinct: ids.size, created: res.map((r) => ("created" in r ? r.created : "err")) });
    const idx = await plat((tx) => tx.execute(sql`select indexname from pg_indexes where tablename = 'table_sessions' and indexname = 'table_sessions_open_table_uq'`));
    check("COR-26 partial unique index present", (idx as unknown as unknown[]).length === 1);
  }

  /* ── SBR-006 ── */
  {
    const table = await mkTable("QA-OLD", null, 4, true);
    created.tables.push(table.id);
    const { session: old } = await tt(t, (tx) => openOrGetSession(tx, t, table.id));
    await round(old.id);
    await plat(async (tx) => {
      await tx.update(tableSessions).set({ openedAt: sql`now() - interval '20 hours'` }).where(eq(tableSessions.id, old.id));
      await tx.update(restaurantOrders).set({ placedAt: sql`now() - interval '19 hours'` }).where(eq(restaurantOrders.sessionId, old.id));
    });
    const page = await hreq(HOST, `/t/${table.qrToken}`);
    const now = await tt(t, (tx) => tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, t), eq(tableSessions.tableId, table.id))));
    const fresh = now.find((s) => s.id !== old.id && s.status === "open");
    const prev = now.find((s) => s.id === old.id);
    check("SBR-006 next-day scan opens a new session; yesterday's unpaid one is kept as expired", page.status === 200 && !!fresh && prev?.status === "expired" && page.body.includes(fresh!.token) && !page.body.includes(old.token), { http: page.status, old: prev?.status, fresh: fresh?.token });
  }

  /* ── reservations ── */
  const day = addDays(bangkokParts(new Date()).ymd, 20);
  {
    const zone = `QAZ${tag}`;
    const tbl = await mkTable("QA-Z", zone, 4, true);
    created.tables.push(tbl.id);
    const startsAt = bangkokDate(day, "12:00");
    await Promise.all(Array.from({ length: 3 }, () => tt(t, (tx) => tx.select({ id: diningTables.id }).from(diningTables).limit(1))));
    const res = await Promise.all(
      [1, 2, 3].map((i) => tt(t, (tx) => createReservation(tx, t, { name: `QA par ${i}`, phone: "0899990000", partySize: 2, startsAt, zone })).catch((e: Error) => ({ ok: false as const, error: e.message, code: "error" }))),
    );
    for (const r of res) if (r.ok) created.reservations.push(r.value.reservation.id);
    check("COR-10 3 parallel bookings for a 1-table zone → exactly 1 accepted", res.filter((r) => r.ok).length === 1, res.map((r) => (r.ok ? r.value.reservation.number : r.code)));

    // SBR-013: zone-less bookings fill the restaurant → the zone check sees it
    const all = await tt(t, (tx) => tx.select({ id: diningTables.id }).from(diningTables).where(and(eq(diningTables.tenantId, t), eq(diningTables.active, true))));
    const slot = bangkokDate(day, "18:00");
    let made = 0;
    for (let i = 0; i < all.length - 1; i++) {
      const r = await tt(t, (tx) => createReservation(tx, t, { name: `QA nozone ${i}`, phone: "0899990001", partySize: 2, startsAt: slot }));
      if (r.ok) {
        made++;
        created.reservations.push(r.value.reservation.id);
      }
    }
    const zoneAvail = await tt(t, (tx) => checkAvailability(tx, t, { startsAt: slot, zone: "สวน" }));
    const anyAvail = await tt(t, (tx) => checkAvailability(tx, t, { startsAt: slot }));
    check("SBR-013 zone remaining ≤ restaurant remaining", zoneAvail.remaining <= anyAvail.remaining && anyAvail.remaining <= 1, { made, zone: zoneAvail, any: anyAvail });
    const g1 = await tt(t, (tx) => createReservation(tx, t, { name: "QA garden 1", phone: "0899990002", partySize: 2, startsAt: slot, zone: "สวน" }));
    if (g1.ok) created.reservations.push(g1.value.reservation.id);
    const g2 = await tt(t, (tx) => createReservation(tx, t, { name: "QA garden 2", phone: "0899990003", partySize: 2, startsAt: slot, zone: "สวน" }));
    if (g2.ok) created.reservations.push(g2.value.reservation.id);
    check("SBR-013 once every table is held, a zone booking is refused", !g2.ok && (g2.ok ? "" : g2.code) === "full", { g1: g1.ok, g2: g2.ok ? g2.value.reservation.number : g2.code });

    // SBR-014: availability API honours the party size
    const api40 = await hreq(HOST, `/api/restaurant/reservations/availability?date=${addDays(day, 1)}&time=12:00&size=40&zone=${encodeURIComponent("สวน")}`);
    const api2 = await hreq(HOST, `/api/restaurant/reservations/availability?date=${addDays(day, 1)}&time=12:00&size=2&zone=${encodeURIComponent("สวน")}`);
    check("SBR-014 availability: party of 40 does not fit the garden, a couple does", api40.status === 200 && JSON.parse(api40.body).available === false && JSON.parse(api2.body).available === true, { s40: api40.body, s2: api2.body });

    // COR-34
    const dep = await tt(t, (tx) => createReservation(tx, t, { name: "QA deposit", phone: "0899990004", partySize: 2, startsAt: bangkokDate(addDays(day, 2), "12:00"), depositAmount: 30000, promptpayId }));
    if (dep.ok) {
      created.reservations.push(dep.value.reservation.id);
      await tt(t, (tx) => cancelReservation(tx, t, dep.value.reservation.id, "QA"));
      const m = multipart("slip", "slip.png", "image/png", PNG);
      const late = await hreq(HOST, `/api/payments/${dep.value.payment!.id}/slip?p=0899990004`, { method: "POST", headers: { "content-type": m.contentType, "content-length": String(m.body.length) }, body: m.body });
      const [p] = await tt(t, (tx) => tx.select({ status: payments.status }).from(payments).where(eq(payments.id, dep.value.payment!.id)));
      check("COR-34 cancelled reservation: deposit QR cancelled, late slip 409", p?.status === "cancelled" && late.status === 409, { payment: p?.status, slip: late.status });
    } else check("COR-34 deposit reservation created", false, dep.error);
  }

  /* ── COR-22 ── */
  {
    const cases: Array<[string, string, Record<string, string>?, string?]> = [
      ["GET", "/api/restaurant/session/%00%00"],
      ["POST", "/api/restaurant/session/%00%00/call", { "content-type": "application/json" }, JSON.stringify({ kind: "staff" })],
      ["GET", "/api/restaurant/orders/%00?p=0812345678"],
      ["GET", "/orders/r/%00?p=0812345678"],
      ["GET", "/reservations/%00?p=0812345678"],
      ["GET", "/t/%00"],
    ];
    for (const [method, path, headers, body] of cases) {
      const r = await hreq(HOST, path, { method, headers, body });
      check(`COR-22 ${method} ${path} → 4xx`, r.status >= 400 && r.status < 500, r.status);
    }
  }

  // cleanup: test tables (cascade sessions), reservations
  await plat(async (tx) => {
    if (created.reservations.length) await tx.update(reservations).set({ status: "cancelled" }).where(inArray(reservations.id, created.reservations));
    await tx.update(diningTables).set({ active: false }).where(inArray(diningTables.id, created.tables));
  });
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nALL PASS");
  await done();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await done();
  process.exit(1);
});
