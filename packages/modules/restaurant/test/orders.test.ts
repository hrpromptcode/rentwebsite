import { beforeAll, describe, expect, it } from "vitest";
import { eq, eventsOutbox, payments, restaurantOrders } from "@rentweb/db";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import { createOrder, getOrderForCustomer, kitchenQueue, onRestaurantOrderPaid, updateOrderStatus } from "../src/services/orders";
import { getTableByQr, openOrGetSession, requestBill, sessionSummary, callStaff, closeSession } from "../src/services/tables";
import { makeFixture, unwrap, type Fixture } from "./helpers";

let f: Fixture;
beforeAll(async () => {
  f = await makeFixture();
  registerPaymentHandler("rest_order", onRestaurantOrderPaid);
});

describe("table sessions", () => {
  it("opens one session per table and reuses it on the next scan", async () => {
    const table = await f.tx((tx) => getTableByQr(tx, f.tenantId, "qr-a1"));
    expect(table?.name).toBe("A1");
    const first = await f.tx((tx) => openOrGetSession(tx, f.tenantId, table!.id));
    const second = await f.tx((tx) => openOrGetSession(tx, f.tenantId, table!.id));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.session.id).toBe(first.session.id);
    expect(first.session.token).toMatch(/^[A-Z0-9]{6}$/);
    expect(await f.tx((tx) => getTableByQr(tx, f.tenantId, "nope"))).toBeNull();
  });
});

describe("dine-in orders", () => {
  it("creates a numbered order with snapshotted items, pay_at_counter, and moves through statuses", async () => {
    const table = (await f.tx((tx) => getTableByQr(tx, f.tenantId, "qr-a2")))!;
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, table.id));

    const created = unwrap(
      await f.tx((tx) =>
        createOrder(tx, f.tenantId, {
          type: "dine_in",
          sessionId: session.id,
          guestLabel: "คุณเอ",
          items: [
            { menuItemId: f.ids.curry, qty: 1, modifierIds: [f.ids.spicyMild, f.ids.extraRice], note: "ไม่ใส่มะเขือ" },
            { menuItemId: f.ids.tea, qty: 2, modifierIds: [f.ids.sweetNormal] },
          ],
        }),
      ),
    );
    expect(created.order.number).toBe("R-1001");
    expect(created.order.type).toBe("dine_in");
    expect(created.order.tableId).toBe(table.id);
    expect(created.order.paymentStatus).toBe("pay_at_counter");
    expect(created.order.status).toBe("received");
    expect(created.order.total).toBe(24000 + 14000);
    expect(created.payment).toBeNull();
    expect(created.items).toHaveLength(2);
    const curryLine = created.items.find((i) => i.menuItemId === f.ids.curry)!;
    expect(curryLine.unitPrice).toBe(24000);
    expect(curryLine.modifiers).toEqual([
      { group: "ระดับความเผ็ด", name: "เผ็ดน้อย", priceDelta: 0 },
      { group: "เพิ่มพิเศษ", name: "ข้าวสวย", priceDelta: 2000 },
    ]);
    expect(curryLine.note).toBe("ไม่ใส่มะเขือ");
    expect(curryLine.station).toBe("kitchen");
    expect(created.items.find((i) => i.menuItemId === f.ids.tea)!.station).toBe("bar");

    // second round in the same session gets the next number
    const second = unwrap(await f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId: session.id, items: [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] }] })));
    expect(second.order.number).toBe("R-1002");

    const summary = (await f.tx((tx) => sessionSummary(tx, f.tenantId, session.id)))!;
    expect(summary.orders.map((o) => o.number)).toEqual(["R-1001", "R-1002"]);
    expect(summary.total).toBe(38000 + 16000);
    expect(summary.dueTotal).toBe(54000);

    // kitchen queue groups by station
    const queue = await f.tx((tx) => kitchenQueue(tx, f.tenantId));
    expect(queue.kitchen?.queued?.map((i) => i.name)).toEqual(["แกงเขียวหวาน", "หมูสะเต๊ะ"]);
    expect(queue.bar?.queued?.[0]?.quantity).toBe(2);

    // status transitions
    const orderId = created.order.id;
    expect((await f.tx((tx) => updateOrderStatus(tx, f.tenantId, orderId, "served"))).ok).toBe(false);
    expect(unwrap(await f.tx((tx) => updateOrderStatus(tx, f.tenantId, orderId, "preparing"))).status).toBe("preparing");
    const ready = unwrap(await f.tx((tx) => updateOrderStatus(tx, f.tenantId, orderId, "ready")));
    expect(ready.readyAt).toBeInstanceOf(Date);
    expect(unwrap(await f.tx((tx) => updateOrderStatus(tx, f.tenantId, orderId, "served"))).status).toBe("served");
    const back = await f.tx((tx) => updateOrderStatus(tx, f.tenantId, orderId, "received"));
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.code).toBe("invalid_transition");
    const afterReady = await f.tx((tx) => kitchenQueue(tx, f.tenantId));
    expect(afterReady.kitchen?.queued?.map((i) => i.name)).toEqual(["หมูสะเต๊ะ"]);

    // dine-in order is only viewable with the session token
    const denied = await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, "R-1001", { phone: "0812345678" }));
    expect(denied.ok).toBe(false);
    const allowed = await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, "r-1001", { sessionToken: session.token.toLowerCase() }));
    expect(allowed.ok).toBe(true);

    // call staff + request bill at the counter
    expect((await f.tx((tx) => callStaff(tx, f.tenantId, session.id))).ok).toBe(true);
    const bill = unwrap(await f.tx((tx) => requestBill(tx, f.tenantId, session.id, { method: "counter" })));
    expect(bill.session.status).toBe("bill_requested");
    expect(bill.amount).toBe(54000);
    expect(bill.payment).toBeNull();
    const events = await f.tx((tx) => tx.select({ type: eventsOutbox.type }).from(eventsOutbox));
    const types = events.map((e) => e.type);
    expect(types).toContain("table.call_staff");
    expect(types).toContain("table.bill_requested");
    expect(types).toContain("rest_order.created");
    expect(types).toContain("rest_order.status_changed");

    // closing the table completes the open orders
    const closed = unwrap(await f.tx((tx) => closeSession(tx, f.tenantId, session.id)));
    expect(closed.status).toBe("closed");
    const after = await f.tx((tx) => tx.select({ status: restaurantOrders.status }).from(restaurantOrders).where(eq(restaurantOrders.sessionId, session.id)));
    expect(after.every((o) => o.status === "completed")).toBe(true);
  });

  it("session bill via PromptPay pays every order of the session once (idempotent handler)", async () => {
    const table = (await f.tx((tx) => getTableByQr(tx, f.tenantId, "qr-g1")))!;
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, table.id));
    unwrap(await f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId: session.id, items: [{ menuItemId: f.ids.satay, qty: 2, modifierIds: [f.ids.extraEgg] }] })));
    unwrap(await f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId: session.id, items: [{ menuItemId: f.ids.tea, qty: 1, modifierIds: [f.ids.sweetNormal] }] })));
    const bill = unwrap(await f.tx((tx) => requestBill(tx, f.tenantId, session.id, { method: "promptpay_qr", promptpayId: "0829876543" })));
    expect(bill.payment?.method).toBe("promptpay_qr");
    expect(bill.payment?.amount).toBe(35000 + 7000);
    expect(bill.payment?.qrPayload).toMatch(/^000201/);
    // tapping again reuses the same pending payment
    const again = unwrap(await f.tx((tx) => requestBill(tx, f.tenantId, session.id, { method: "promptpay_qr", promptpayId: "0829876543" })));
    expect(again.payment?.id).toBe(bill.payment!.id);

    await f.tx((tx) => markPaid(tx, f.tenantId, bill.payment!.id, { verifiedBy: "test" }));
    await f.tx((tx) => markPaid(tx, f.tenantId, bill.payment!.id, { verifiedBy: "test" })); // no-op
    await f.tx(async (tx) => {
      const [p] = await tx.select().from(payments).where(eq(payments.id, bill.payment!.id));
      await onRestaurantOrderPaid(tx, p!); // direct re-run, still idempotent
    });

    const summary = (await f.tx((tx) => sessionSummary(tx, f.tenantId, session.id)))!;
    expect(summary.session.status).toBe("paid");
    expect(summary.orders.every((o) => o.paymentStatus === "paid")).toBe(true);
    expect(summary.dueTotal).toBe(0);
    const paidEvents = await f.tx((tx) => tx.select({ type: eventsOutbox.type }).from(eventsOutbox).where(eq(eventsOutbox.type, "table.paid")));
    expect(paidEvents).toHaveLength(1);
  });
});

describe("pickup orders", () => {
  it("requires contact, creates a PromptPay payment and is paid exactly once", async () => {
    const noPhone = await f.tx((tx) => createOrder(tx, f.tenantId, { type: "pickup", items: [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] }], contact: { name: "บี" } }));
    expect(noPhone.ok).toBe(false);
    if (!noPhone.ok) expect(noPhone.code).toBe("phone_required");

    const created = unwrap(
      await f.tx((tx) =>
        createOrder(tx, f.tenantId, {
          type: "pickup",
          items: [{ menuItemId: f.ids.curry, qty: 1, modifierIds: [f.ids.spicyHot] }],
          contact: { name: "คุณบี", phone: "081-234-5678" },
          scheduledFor: new Date(Date.now() + 3_600_000),
          paymentMethod: "promptpay_qr",
          promptpayId: "0829876543",
          serviceChargePercent: 0,
        }),
      ),
    );
    expect(created.order.type).toBe("pickup");
    expect(created.order.customerPhone).toBe("0812345678");
    expect(created.order.customerId).toBeTruthy();
    expect(created.order.paymentStatus).toBe("unpaid");
    expect(created.payment?.refType).toBe("rest_order");
    expect(created.payment?.refId).toBe(created.order.id);
    expect(created.order.paymentId).toBe(created.payment!.id);

    // lookup by number + phone
    const ok = await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, created.order.number, { phone: "0812345678" }));
    expect(ok.ok).toBe(true);
    const wrong = await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, created.order.number, { phone: "0899999999" }));
    expect(wrong.ok).toBe(false);

    await f.tx((tx) => markPaid(tx, f.tenantId, created.payment!.id, { verifiedBy: "auto" }));
    await f.tx((tx) => markPaid(tx, f.tenantId, created.payment!.id, { verifiedBy: "auto" }));
    const [row] = await f.tx((tx) => tx.select().from(restaurantOrders).where(eq(restaurantOrders.id, created.order.id)));
    expect(row!.paymentStatus).toBe("paid");
    const paidEvents = await f.tx((tx) => tx.select({ type: eventsOutbox.type }).from(eventsOutbox).where(eq(eventsOutbox.type, "rest_order.paid")));
    expect(paidEvents).toHaveLength(1);

    // cash pickup = pay at the counter when collecting
    const cash = unwrap(await f.tx((tx) => createOrder(tx, f.tenantId, { type: "pickup", items: [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] }], contact: { name: "ซี", phone: "0823456789" }, paymentMethod: "cash" })));
    expect(cash.order.paymentStatus).toBe("pay_at_counter");
    expect(cash.payment).toBeNull();
  });
});
