import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { bookings, customers, diningTables, eventsOutbox, notifications, orders, reservations, restaurantOrders, services, staff, tenantMembers, tenants, user, withPlatform } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { HANDLERS, type OutboxEvent } from "../src/events/handlers";

/**
 * Notification rendering at send time:
 *   COR-14 no reminders for cancelled / moved bookings
 *   COR-15 order messages carry the guest access link and the customer name
 *   COR-16 booking messages name the service / staff and link with the access key
 *   COR-17 restaurant owner messages show the table, the note and the real amounts
 * Events use the thin payloads the hunt observed, so the handlers must load the rest from the rows.
 */

let db: TestDb;
let tenantId: string;
let serviceId: string;
let staffId: string;

const run = (type: string, payload: Record<string, unknown>) =>
  withPlatform(db, (tx) => HANDLERS[type]!(tx, { id: crypto.randomUUID(), tenantId, type, payload, attempts: 1 } satisfies OutboxEvent));

async function sent(template: string) {
  return db.select().from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.template, template)));
}

async function booking(status: string, startsAt: Date, accessKey = "BK-KEY-1") {
  const [b] = await db
    .insert(bookings)
    .values({ tenantId, number: `BK-${Math.floor(Math.random() * 1e6)}`, serviceId, staffId, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), status, customerName: "สมหญิง", customerPhone: "0891234567", answers: { accessKey } })
    .returning();
  return b!;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [t] = await db.insert(tenants).values({ slug: "t-notify", name: "ร้านทดสอบ", siteType: "shop", settings: { contact: { email: "owner@example.com" }, notifications: { ownerLineUserId: "U-owner-test" } } }).returning({ id: tenants.id });
  tenantId = t!.id;
  const [s] = await db.insert(services).values({ tenantId, name: "นวดอโรมา 90 นาที", slug: "aroma" }).returning({ id: services.id });
  serviceId = s!.id;
  const [st] = await db.insert(staff).values({ tenantId, name: "พี่แอน", slug: "ann" }).returning({ id: staff.id });
  staffId = st!.id;
});

describe("booking reminders (COR-14)", () => {
  it("skips cancelled bookings and bookings whose time moved; sends for the live one", async () => {
    const at = new Date(Date.now() + 2 * 86_400_000);
    const cancelled = await booking("cancelled", at);
    const moved = await booking("confirmed", new Date(at.getTime() + 3_600_000));
    const live = await booking("confirmed", new Date(at.getTime() + 7_200_000));
    await run("booking.reminder", { bookingId: cancelled.id, startsAt: cancelled.startsAt.toISOString(), hoursBefore: 24 });
    await run("booking.reminder", { bookingId: moved.id, startsAt: at.toISOString(), hoursBefore: 24 });
    await run("booking.reminder", { bookingId: live.id, startsAt: live.startsAt.toISOString(), hoursBefore: 24 });
    const rows = await sent("booking.reminder");
    expect(rows).toHaveLength(1);
    expect((rows[0]!.payload as { title: string }).title).toBe("เตือนนัด นวดอโรมา 90 นาที พรุ่งนี้");
    expect(rows[0]!.recipient).toBe("0891234567");
  });

  it("booking.confirmed schedules each reminder once, for the booking's current time", async () => {
    const b = await booking("confirmed", new Date(Date.now() + 3 * 86_400_000));
    const payload = { bookingId: b.id, number: b.number, startsAt: new Date(0).toISOString(), customerId: null };
    await run("booking.confirmed", payload);
    await run("booking.confirmed", payload); // retry
    const reminders = (await db.select().from(eventsOutbox).where(eq(eventsOutbox.type, "booking.reminder"))).filter((e) => (e.payload as { bookingId?: string }).bookingId === b.id);
    expect(reminders.map((r) => (r.payload as { hoursBefore: number }).hoursBefore).sort()).toEqual([2, 24]);
    for (const r of reminders) expect((r.payload as { startsAt: string }).startsAt).toBe(b.startsAt.toISOString());
  });
});

describe("booking messages (COR-16)", () => {
  it("names the service and staff and links with the access key", async () => {
    const b = await booking("pending", new Date(Date.now() + 5 * 86_400_000), "GUEST-KEY-16");
    // payload keys exactly as observed in the hunt
    await run("booking.created", { bookingId: b.id, number: b.number, status: "pending", staffId, startsAt: b.startsAt.toISOString(), serviceId, customerId: null, depositAmount: 50000, rescheduledFromId: null });
    const [customer] = (await sent("booking.created")).filter((r) => r.recipient === "0891234567");
    const p = customer!.payload as { text: string; link: string };
    expect(p.text).toContain("นวดอโรมา 90 นาที กับ พี่แอน");
    expect(p.link).toMatch(new RegExp(`/bookings/${b.id}\\?k=GUEST-KEY-16$`));
    const [owner] = await sent("booking.owner");
    expect((owner!.payload as { text: string }).text).toContain("สมหญิง จอง นวดอโรมา 90 นาที");
  });

  it("sends nothing for a booking cancelled before the event was processed", async () => {
    const b = await booking("cancelled", new Date(Date.now() + 6 * 86_400_000));
    const before = (await sent("booking.confirmed")).length;
    await run("booking.confirmed", { bookingId: b.id, number: b.number, startsAt: b.startsAt.toISOString() });
    expect((await sent("booking.confirmed")).length).toBe(before);
  });
});

describe("order messages (COR-15)", () => {
  it("order.paid with the thin storefront payload links the guest with ?k= and names the customer", async () => {
    const [o] = await db.insert(orders).values({ tenantId, number: "#1028", status: "confirmed", paymentStatus: "paid", total: 65000, phone: "0812223333", customerName: "คุณเอ", metadata: { accessKey: "ORDER-KEY-15" } }).returning();
    await run("order.paid", { orderId: o!.id, number: "#1028", total: 65000, customerId: null, paymentId: crypto.randomUUID() });
    const [customer] = await sent("order.paid");
    expect(customer!.recipient).toBe("0812223333");
    expect((customer!.payload as { link: string }).link).toMatch(new RegExp(`/orders/${o!.id}\\?k=ORDER-KEY-15$`));
    const [owner] = await sent("order.paid.owner");
    expect((owner!.payload as { text: string }).text).toBe(`ลูกค้า คุณเอ ชำระเงินแล้ว ${thb(65000)} ตรวจสอบและจัดส่งได้ที่หลังบ้าน`);
  });

  it("no 'paid' message for an order that was cancelled in the meantime", async () => {
    const [o] = await db.insert(orders).values({ tenantId, number: "#1029", status: "cancelled", total: 1000, phone: "0812224444" }).returning();
    await run("order.paid", { orderId: o!.id, number: "#1029", total: 1000 });
    expect((await sent("order.paid")).some((r) => r.recipient === "0812224444")).toBe(false);
  });
});

describe("restaurant owner messages (COR-17)", () => {
  it("table name, the guest's note and real amounts", async () => {
    const [table] = await db.insert(diningTables).values({ tenantId, name: "A3", qrToken: "qr-a3" }).returning();
    await run("table.call_staff", { sessionId: crypto.randomUUID(), tableId: table!.id, note: "ขอน้ำแข็ง" });
    const [call] = await sent("table.call_staff");
    expect(call!.payload).toMatchObject({ title: "โต๊ะ A3 เรียกพนักงาน", text: "ขอน้ำแข็ง" });

    await run("table.bill_requested", { sessionId: crypto.randomUUID(), tableId: table!.id, method: "promptpay_qr", amount: 32000, paymentId: null });
    const [bill] = await sent("table.bill_requested");
    expect((bill!.payload as { title: string }).title).toBe("โต๊ะ A3 ขอบิล");
    expect((bill!.payload as { text: string }).text).toContain(`ยอดรวม ${thb(32000)}`);

    const [ro] = await db.insert(restaurantOrders).values({ tenantId, number: "R-1013", type: "pickup", total: 16000 }).returning();
    await run("rest_order.paid", { orderId: ro!.id, number: "R-1013", amount: 16000, paymentId: crypto.randomUUID() });
    const [paid] = await sent("rest_order.paid");
    expect((paid!.payload as { text: string }).text).toBe(`ยอด ${thb(16000)} (รับที่ร้าน)`);
  });

  it("reservation owner message names the guest", async () => {
    const startsAt = new Date(Date.now() + 86_400_000);
    const [r] = await db.insert(reservations).values({ tenantId, number: "RS-1001", name: "คุณบี", phone: "0815556666", partySize: 4, startsAt, endsAt: new Date(startsAt.getTime() + 5_400_000) }).returning();
    await run("reservation.created", { reservationId: r!.id, number: "RS-1001", startsAt: startsAt.toISOString(), partySize: 4, zone: null, status: "pending", deposit: 0, phone: "0815556666" });
    const [owner] = await sent("reservation.owner");
    expect((owner!.payload as { text: string }).text).toMatch(/^คุณบี 4 ท่าน/);
  });
});

describe("recipients (auth follow-ups AC-02 / AC-03 / SS-02)", () => {
  it("owner messages fall back to the owner's account e-mail when the shop contact e-mail is blank", async () => {
    const [t2] = await db.insert(tenants).values({ slug: "t-notify-blank", name: "ร้านใหม่", siteType: "shop", settings: { contact: { email: "" } } }).returning({ id: tenants.id });
    const owner = { id: `u-own-${crypto.randomUUID()}`, name: "Owner", email: "owner.account@example.com", emailVerified: true };
    const staffUser = { id: `u-stf-${crypto.randomUUID()}`, name: "Staff", email: "staff.account@example.com", emailVerified: true };
    await db.insert(user).values([owner, staffUser]);
    await db.insert(tenantMembers).values([
      { tenantId: t2!.id, userId: staffUser.id, role: "staff" },
      { tenantId: t2!.id, userId: owner.id, role: "owner" },
    ]);
    const [o] = await db.insert(orders).values({ tenantId: t2!.id, number: "#2001", status: "confirmed", paymentStatus: "paid", total: 1000, phone: "0810000001", customerName: "คุณซี" }).returning();
    await withPlatform(db, (tx) => HANDLERS["order.paid"]!(tx, { id: crypto.randomUUID(), tenantId: t2!.id, type: "order.paid", payload: { orderId: o!.id, number: "#2001", total: 1000 }, attempts: 1 }));
    const rows = await db.select().from(notifications).where(and(eq(notifications.tenantId, t2!.id), eq(notifications.template, "order.paid.owner")));
    expect(rows.map((r) => [r.channel, r.recipient])).toEqual([["email", "owner.account@example.com"]]);
  });

  it("the shop contact e-mail still wins when it is set", async () => {
    const [o] = await db.insert(orders).values({ tenantId, number: "#2002", status: "confirmed", paymentStatus: "paid", total: 1000, phone: "0810000002" }).returning();
    await run("order.paid", { orderId: o!.id, number: "#2002", total: 1000 });
    const rows = (await sent("order.paid.owner")).filter((r) => r.channel === "email" && (r.payload as { title: string }).title.includes("#2002"));
    expect(rows.map((r) => r.recipient)).toEqual(["owner@example.com"]);
  });

  it("customer messages prefer the e-mail / phone typed on the order or booking over the customer record", async () => {
    const [c] = await db.insert(customers).values({ tenantId, name: "เก่า", email: "stale@example.com", phone: "0899999999" }).returning();
    const [o] = await db.insert(orders).values({ tenantId, number: "#2003", status: "confirmed", paymentStatus: "paid", total: 1000, customerId: c!.id, email: "typed@example.com", phone: "0811112222", metadata: { accessKey: "K-2003" } }).returning();
    await run("order.paid", { orderId: o!.id, number: "#2003", total: 1000, customerId: c!.id });
    const orderRows = (await sent("order.paid")).filter((r) => (r.payload as { orderId?: string }).orderId === o!.id);
    expect(orderRows.map((r) => r.recipient).sort()).toEqual(["0811112222", "typed@example.com"]);

    const at = new Date(Date.now() + 9 * 86_400_000 + 5 * 3_600_000); // clear of the other tests' bookings for the same staff
    const [b] = await db
      .insert(bookings)
      .values({ tenantId, number: `BK-${Math.floor(Math.random() * 1e6)}`, serviceId, staffId, startsAt: at, endsAt: new Date(at.getTime() + 3_600_000), status: "confirmed", customerId: c!.id, customerName: "สมหญิง", customerPhone: "0833334444", customerEmail: "booked@example.com", answers: { accessKey: "BK-KEY-2" } })
      .returning();
    await run("booking.confirmed", { bookingId: b!.id, number: b!.number, startsAt: at.toISOString() });
    const bookingRows = (await sent("booking.confirmed")).filter((r) => (r.payload as { bookingId?: string }).bookingId === b!.id);
    expect(bookingRows.map((r) => r.recipient).sort()).toEqual(["0833334444", "booked@example.com"]);
  });

  it("the customer record still fills a contact the order does not have", async () => {
    const [c] = await db.insert(customers).values({ tenantId, name: "มีอีเมล", email: "record@example.com", phone: "0855556666" }).returning();
    const [o] = await db.insert(orders).values({ tenantId, number: "#2004", status: "confirmed", paymentStatus: "paid", total: 1000, customerId: c!.id, phone: "0877778888" }).returning();
    await run("order.paid", { orderId: o!.id, number: "#2004", total: 1000, customerId: c!.id });
    const rows = (await sent("order.paid")).filter((r) => (r.payload as { orderId?: string }).orderId === o!.id);
    expect(rows.map((r) => r.recipient).sort()).toEqual(["0877778888", "record@example.com"]);
  });
});
