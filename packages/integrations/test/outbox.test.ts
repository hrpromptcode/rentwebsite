import { beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { eventsOutbox, payments, tenants, withPlatform } from "@rentweb/db";
import { createPayment, registerPaymentClosedHandler } from "@rentweb/core/payments";
import { processOutbox } from "../src/outbox";

/** COR-13: two drainers at once must not re-claim events the other one is still processing. */

let db: TestDb;
beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("processOutbox leasing (COR-13)", () => {
  it("overlapping drainers handle a backlog of old events exactly once", async () => {
    const type = `qa.noop.${Date.now().toString(36)}`;
    const old = new Date(Date.now() - 3_600_000);
    await db.insert(eventsOutbox).values(Array.from({ length: 12 }, () => ({ tenantId: null, type, payload: {}, nextRunAt: old, createdAt: old })));

    const [a, b] = await Promise.all([processOutbox(db, 100, { expirePayments: false }), processOutbox(db, 100, { expirePayments: false })]);
    expect(a.claimed + b.claimed).toBe(12);
    const rows = await db.select().from(eventsOutbox).where(eq(eventsOutbox.type, type));
    expect(rows.every((r) => r.status === "done")).toBe(true);
    expect(rows.reduce((s, r) => s + r.attempts, 0)).toBe(12);
  });

  it("re-claims a processing event only after its lease ran out", async () => {
    const type = `qa.lease.${Date.now().toString(36)}`;
    const [live, dead] = await db
      .insert(eventsOutbox)
      .values([
        { tenantId: null, type, payload: {}, status: "processing", attempts: 1, nextRunAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date(Date.now() - 3_600_000) },
        { tenantId: null, type, payload: {}, status: "processing", attempts: 1, nextRunAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 3_600_000) },
      ])
      .returning();
    await processOutbox(db, 100, { expirePayments: false });
    const rows = await db.select().from(eventsOutbox).where(inArray(eventsOutbox.id, [live!.id, dead!.id]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(live!.id)).toMatchObject({ status: "processing", attempts: 1 });
    expect(byId.get(dead!.id)).toMatchObject({ status: "done", attempts: 2 });
  });
});

describe("payment expiry sweep runs from the outbox path (COR-33)", () => {
  it("expires a stale unpaid payment and calls the module closed handler", async () => {
    const closed: string[] = [];
    registerPaymentClosedHandler("reservation", async (_tx, p, info) => {
      closed.push(`${p.id}:${info.status}`);
    });
    const [t] = await db.insert(tenants).values({ slug: "t-sweep", name: "Sweep", siteType: "restaurant" }).returning({ id: tenants.id });
    const p = await withPlatform(db, (tx) => createPayment(tx, t!.id, { refType: "reservation", refId: crypto.randomUUID(), amount: 20000, provider: "promptpay", method: "promptpay_qr", expiresMinutes: 30 }));
    await db.update(payments).set({ expiresAt: new Date(Date.now() - 3_600_000) }).where(eq(payments.id, p.id));
    const r = await processOutbox(db, 0, { expirePayments: true });
    expect(r.expired).toBe(1);
    expect(closed).toEqual([`${p.id}:expired`]);
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    expect(row!.status).toBe("expired");
  });
});
