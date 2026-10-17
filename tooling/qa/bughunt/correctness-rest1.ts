/**
 * correctness bughunt – restaurant table bill: QR issued for the due amount, guests order another round,
 * then the stale QR's slip is uploaded → whole session marked paid?
 */
import { done, hreq, multipart, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, sql, tenants, diningTables, menuItems, restaurantOrders, tableSessions, payments } from "@rentweb/db";
import { registerPaymentHandler, resolvePromptpayId } from "@rentweb/core/payments";
import { createOrder, onRestaurantOrderPaid, openOrGetSession, requestBill, sessionSummary } from "../../../packages/modules/restaurant/src/services/index";

registerPaymentHandler("rest_order", onRestaurantOrderPaid);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const t = await tenantIdOf("demo-restaurant");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  console.log("payments settings", JSON.stringify((settings as any).payments ?? null));
  const tag = Date.now().toString(36).toUpperCase().slice(-4);
  const table = await tt(t, async (tx) => (await tx.insert(diningTables).values({ tenantId: t, name: `QA-COR ${tag}`, qrToken: `qacor${tag.toLowerCase()}${Math.random().toString(36).slice(2, 8)}`, seats: 2 }).returning())[0]!);
  const items = await tt(t, (tx) => tx.select({ id: menuItems.id, name: menuItems.name, price: menuItems.price }).from(menuItems).where(and(eq(menuItems.tenantId, t), eq(menuItems.available, true), eq(menuItems.soldOut, false))).limit(40));
  const { session } = await tt(t, (tx) => openOrGetSession(tx, t, table.id));
  const order = async (label: string) => {
    for (const it of items) {
      const r = await tt(t, (tx) => createOrder(tx, t, { type: "dine_in", sessionId: session.id, items: [{ menuItemId: it.id, qty: 1, modifierIds: [] }], guestLabel: label }));
      if (r.ok) return r.value.order;
    }
    throw new Error("no orderable item");
  };
  const o1 = await order("round1");
  const bill = await tt(t, (tx) => requestBill(tx, t, session.id, { method: "promptpay_qr", promptpayId: resolvePromptpayId(settings) }));
  if (!bill.ok) throw new Error(bill.error);
  console.log("round1", o1.number, o1.total, "→ bill QR", bill.value.payment?.id, "amount", bill.value.amount);
  const o2 = await order("round2");
  console.log("round2 after bill request", o2.number, o2.total);
  const before = await tt(t, (tx) => sessionSummary(tx, t, session.id));
  console.log("before slip: session", before!.session.status, "total", before!.total, "due", before!.dueTotal, "payment.amount", before!.payment?.amount);
  const m = multipart("slip", "slip.png", "image/png", PNG);
  const up = await hreq("demo-restaurant.localhost:3000", `/api/payments/${bill.value.payment!.id}/slip`, { method: "POST", headers: { "content-type": m.contentType, "content-length": String(m.body.length), cookie: `rw_table=${session.token}` }, body: m.body });
  // reverify-repro 2026-10-17: the guest at the table proves access with the table-session cookie (rw_table, SEC-009)
  console.log("slip upload →", up.status, up.body.slice(0, 120));
  const after = await tt(t, (tx) => sessionSummary(tx, t, session.id));
  console.log("after slip: session", after!.session.status, "total", after!.total, "paidTotal", after!.paidTotal, "due", after!.dueTotal, "orders", JSON.stringify(after!.orders.map((o) => [o.number, o.total, o.paymentStatus])), "payment", JSON.stringify(after!.payment));
  // reverify-repro 2026-10-17: retire the probe table so it does not show up in the demo's public reserve form / capacity
  await tt(t, (tx) => tx.update(diningTables).set({ active: false }).where(and(eq(diningTables.tenantId, t), eq(diningTables.id, table.id))));
  const o2paid = after!.orders.find((o) => o.number === o2.number)?.paymentStatus === "paid";
  console.log(up.status === 409 && !o2paid && after!.session.status !== "closed" && Number(after!.dueTotal) > 0
    ? "PASS COR-07/SBR-005 stale bill QR voided by the new round: slip refused (409), round 2 stays unpaid, session still due"
    : `FAIL COR-07/SBR-005 bug reproduces (slip ${up.status}, round2 paid=${o2paid}, session ${after!.session.status}, due ${after!.dueTotal})`);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
