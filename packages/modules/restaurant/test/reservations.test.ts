import { beforeAll, describe, expect, it } from "vitest";
import { eq, eventsOutbox, reservations } from "@rentweb/db";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import { cancelReservation, checkAvailability, createReservation, getReservationForCustomer, listZones, onReservationPaid } from "../src/services/reservations";
import { makeFixture, unwrap, type Fixture } from "./helpers";

let f: Fixture;
const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-14T03:00:00Z"); // 10:00 Bangkok

beforeAll(async () => {
  f = await makeFixture();
  registerPaymentHandler("reservation", onReservationPaid);
});

describe("reservations", () => {
  it("lists zones with table counts", async () => {
    const zones = await f.tx((tx) => listZones(tx, f.tenantId));
    expect(zones).toEqual(expect.arrayContaining([{ zone: "ในบ้าน", tables: 2, maxSeats: 4 }, { zone: "สวน", tables: 2, maxSeats: 6 }]));
  });

  it("numbers reservations RS-1001…, confirms without deposit and blocks a zone once its tables are taken", async () => {
    const start = at("2026-10-14T12:00:00Z"); // 19:00 Bangkok
    const first = unwrap(await f.tx((tx) => createReservation(tx, f.tenantId, { name: "คุณเอ", phone: "0811111111", partySize: 4, startsAt: start, zone: "สวน", occasion: "วันเกิด", now: NOW })));
    expect(first.reservation.number).toBe("RS-1001");
    expect(first.reservation.status).toBe("confirmed");
    expect(first.reservation.endsAt.getTime() - first.reservation.startsAt.getTime()).toBe(90 * 60_000);
    expect(first.payment).toBeNull();
    expect(first.reservation.customerId).toBeTruthy();

    const second = unwrap(await f.tx((tx) => createReservation(tx, f.tenantId, { name: "คุณบี", phone: "0822222222", partySize: 2, startsAt: at("2026-10-14T12:30:00Z"), zone: "สวน", now: NOW })));
    expect(second.reservation.number).toBe("RS-1002");

    // both garden tables are now held between 19:00 and 21:00 Bangkok
    const availGarden = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: at("2026-10-14T13:00:00Z"), zone: "สวน" }));
    expect(availGarden).toMatchObject({ capacity: 2, booked: 2, remaining: 0, available: false });
    const third = await f.tx((tx) => createReservation(tx, f.tenantId, { name: "คุณซี", phone: "0833333333", partySize: 2, startsAt: at("2026-10-14T13:00:00Z"), zone: "สวน", now: NOW }));
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.code).toBe("full");

    // a non-overlapping slot and the other zone are still free
    const later = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: at("2026-10-14T14:00:00Z"), zone: "สวน" }));
    expect(later.available).toBe(true);
    const indoor = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: at("2026-10-14T13:00:00Z"), zone: "ในบ้าน" }));
    expect(indoor).toMatchObject({ capacity: 2, booked: 0, available: true });

    // cancelling frees the table
    unwrap(await f.tx((tx) => cancelReservation(tx, f.tenantId, second.reservation.id)));
    const freed = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: at("2026-10-14T13:00:00Z"), zone: "สวน" }));
    expect(freed.remaining).toBe(1);
  });

  it("validates input", async () => {
    const past = await f.tx((tx) => createReservation(tx, f.tenantId, { name: "x", phone: "0811111111", partySize: 2, startsAt: at("2026-10-13T12:00:00Z"), now: NOW }));
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.code).toBe("past");
    const phone = await f.tx((tx) => createReservation(tx, f.tenantId, { name: "x", phone: "12", partySize: 2, startsAt: at("2026-10-20T12:00:00Z"), now: NOW }));
    expect(phone.ok).toBe(false);
    if (!phone.ok) expect(phone.code).toBe("invalid_phone");
    const party = await f.tx((tx) => createReservation(tx, f.tenantId, { name: "x", phone: "0811111111", partySize: 0, startsAt: at("2026-10-20T12:00:00Z"), now: NOW }));
    expect(party.ok).toBe(false);
  });

  it("takes a deposit via PromptPay and confirms once paid (idempotent)", async () => {
    const created = unwrap(
      await f.tx((tx) =>
        createReservation(tx, f.tenantId, { name: "คุณดี", phone: "0844444444", partySize: 6, startsAt: at("2026-10-16T12:00:00Z"), zone: "ในบ้าน", depositAmount: 50000, paymentMethod: "promptpay_qr", promptpayId: "0829876543", now: NOW }),
      ),
    );
    expect(created.reservation.status).toBe("pending");
    expect(created.reservation.depositAmount).toBe(50000);
    expect(created.payment?.refType).toBe("reservation");
    expect(created.payment?.amount).toBe(50000);

    const guarded = await f.tx((tx) => getReservationForCustomer(tx, f.tenantId, created.reservation.number, "0844444444"));
    expect(guarded.ok).toBe(true);
    const denied = await f.tx((tx) => getReservationForCustomer(tx, f.tenantId, created.reservation.number, "0800000000"));
    expect(denied.ok).toBe(false);

    await f.tx((tx) => markPaid(tx, f.tenantId, created.payment!.id, { verifiedBy: "auto" }));
    await f.tx((tx) => markPaid(tx, f.tenantId, created.payment!.id, { verifiedBy: "auto" }));
    const [row] = await f.tx((tx) => tx.select().from(reservations).where(eq(reservations.id, created.reservation.id)));
    expect(row!.status).toBe("confirmed");
    const events = await f.tx((tx) => tx.select({ type: eventsOutbox.type }).from(eventsOutbox).where(eq(eventsOutbox.type, "reservation.paid")));
    expect(events).toHaveLength(1);
  });
});
