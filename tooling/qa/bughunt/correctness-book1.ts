/**
 * correctness bughunt – booking deposit state machine (demo-salon aroma-90, deposit 300 THB):
 *  A: customer cancels a pending booking, then uploads a slip for its still-open deposit payment
 *  B: customer reschedules a pending booking, then pays the deposit QR it received at booking time
 */
import { done, hreq, multipart, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, sql, tenants, tenantModules, bookings, payments } from "@rentweb/db";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { addDays, bookingConfig, cancelBooking, createBooking, getSlotsForDate, getServiceById, onBookingPaid, rescheduleBooking, toBkkParts, toSlotService, ymdToString } from "../../../packages/modules/booking/src/services/index";

registerPaymentHandler("booking", onBookingPaid);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SERVICE = "01a1401b-ad12-7546-8f7f-c6218eab803b"; // aroma-90

async function slip(paymentId: string) {
  const m = multipart("slip", "slip.png", "image/png", PNG);
  const r = await hreq("demo-salon.localhost:3000", `/api/payments/${paymentId}/slip`, { method: "POST", headers: { "content-type": m.contentType, "content-length": String(m.body.length) }, body: m.body });
  return `${r.status} ${r.body.slice(0, 60)}`;
}
async function st(t: string, ids: string[]) {
  return tt(t, async (tx) => {
    const bs = await tx.select({ id: bookings.id, number: bookings.number, status: bookings.status, pay: bookings.paymentStatus }).from(bookings).where(sql`${bookings.id} in ${ids}`);
    const ps = await tx.select({ refId: payments.refId, status: payments.status, amount: payments.amount }).from(payments).where(and(eq(payments.refType, "booking"), sql`${payments.refId} in ${ids}`));
    return JSON.stringify({ bookings: bs.map((b) => [b.number, b.status, b.pay]), payments: ps.map((p) => [ids.indexOf(p.refId) === 0 ? "old/first" : "new", p.status, p.amount]) });
  });
}

async function main() {
  const t = await tenantIdOf("demo-salon");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const mc = await tt(t, async (tx) => (await tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, t), eq(tenantModules.moduleKey, "booking"))))[0]?.c ?? {});
  const config = bookingConfig({ booking: mc });
  const service = (await tt(t, (tx) => getServiceById(tx, t, SERVICE)))!;
  const today = toBkkParts(new Date());
  const slots: string[] = [];
  for (let i = 9; i < 25 && slots.length < 6; i++) {
    const date = ymdToString(addDays(today, i));
    const s = await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(service), date, config }));
    for (const x of s.filter((x) => x.available)) if (slots.length < 6 && !slots.includes(x.start)) slots.push(x.start);
  }
  console.log("config", JSON.stringify(config), "slots", slots.slice(0, 3));
  const book = (start: string, phone: string) => tt(t, (tx) => createBooking(tx, t, { serviceId: SERVICE, start, customer: { name: "QA correctness", phone }, paymentMethod: "promptpay_qr" }, { config, settings }));

  // A
  const a = await book(slots[0]!, "0899200001");
  if (!a.ok) throw new Error("book A " + a.error);
  console.log("A booked", a.value.booking.number, a.value.booking.status, "deposit", a.value.booking.depositAmount, "payment", a.value.payment?.status);
  const c = await tt(t, (tx) => cancelBooking(tx, t, a.value.booking.id, { by: "customer", config }));
  console.log("A cancel", c.ok, await st(t, [a.value.booking.id]));
  console.log("A slip →", await slip(a.value.payment!.id));
  console.log("A after", await st(t, [a.value.booking.id]));

  // B
  const b = await book(slots[2]!, "0899200002");
  if (!b.ok) throw new Error("book B " + b.error);
  const r = await tt(t, (tx) => rescheduleBooking(tx, t, b.value.booking.id, { start: slots[4]!, by: "customer" }, { config, settings }));
  if (!r.ok) throw new Error("resched " + r.error);
  console.log("B booked", b.value.booking.number, "→ rescheduled", r.value.booking.number, "new answers.paymentId == old payment:", (r.value.booking.answers as any).paymentId === b.value.payment!.id, "result.payment", r.value.payment);
  console.log("B slip on original QR →", await slip(b.value.payment!.id));
  console.log("B after", await st(t, [b.value.booking.id, r.value.booking.id]));
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
