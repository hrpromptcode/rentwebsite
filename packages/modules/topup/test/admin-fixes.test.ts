import { beforeAll, describe, expect, it } from "vitest";
import { and, auditLogs, codeStock, desc, eq, eventsOutbox, gamePackages, games, payments, sql, topupOrders, wallets } from "@rentweb/db";
import { decryptFromString, encryptToString } from "@rentweb/core/crypto";
import { attachSlip, getPayment, markPaid, paymentRefundRequired } from "@rentweb/core/payments";
import {
  adminCancelOrder,
  adminFailOrder,
  adminFulfillOrder,
  adminMarkRefunded,
  adminRejectSlip,
  adminRetryOrder,
  backfillStockCodeHashes,
  deleteGame,
  deletePackage,
  getAdminTopupOrder,
  importStockCodes,
  isOwnProofImage,
  normalizeStockCode,
  stockCodeHash,
  stockImportMessage,
  topupKpis,
  TOPUP_SALE_STATUSES,
  voidStockCode,
  type Actor,
} from "../src/admin";
import { createTopupOrder, creditWallet, getOrderById, type CreateTopupOrderInput } from "../src/services";
import { makeFixture, type Fixture } from "./_fixture";

/**
 * Regression tests for the top-up ADMIN bug-hunt fixes (tooling/qa/bughunt/fixes/topup_admin.md).
 * Each describe names the finding ids it pins.
 */

let f: Fixture;
const actor: Actor = { userId: "00000000-0000-4000-8000-0000000000a1", actorType: "user" };

function input(over: Partial<CreateTopupOrderInput> = {}): CreateTopupOrderInput {
  return {
    gameSlug: f.gameSlug,
    packageId: f.manualPackageId,
    playerFields: { uid: "987654321", server: "Asia" },
    paymentMethod: "slip",
    contact: "0812345678",
    customer: { id: f.customerId, tier: "member" },
    ip: "10.9.0.2",
    settings: f.settings,
    config: { maxOrdersPerHour: 500, otpRequiredFirstOrder: false },
    ...over,
  };
}
async function create(over: Partial<CreateTopupOrderInput> = {}) {
  const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input(over)));
  if (!r.ok) throw new Error(`create failed: ${r.code} ${r.error}`);
  return r.value;
}
const outbox = (type: string) => f.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, f.tenantId), eq(eventsOutbox.type, type))).orderBy(desc(eventsOutbox.createdAt)));
const payment = (id: string) => f.tx((tx) => getPayment(tx, f.tenantId, id));
const order = (id: string) => f.tx((tx) => getOrderById(tx, f.tenantId, id));
const codes = (packageId: string) => f.tx((tx) => tx.select().from(codeStock).where(and(eq(codeStock.tenantId, f.tenantId), eq(codeStock.packageId, packageId))));

beforeAll(async () => {
  f = await makeFixture({ stockCodes: 2 });
  await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1_000_000, reason: "topup" }));
});

describe("adminFailOrder refuses an UNPAID order (ADMIN-03)", () => {
  it("not_paid with the Thai message pointing to ยกเลิกรายการ; the order and its payment stay open", async () => {
    const { order: o, payment: p } = await create();
    const r = await f.tx((tx) => adminFailOrder(tx, f.tenantId, o.id, "ทดสอบ", actor));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("not_paid");
    expect(!r.ok && r.error).toContain("ยกเลิกรายการ");
    expect((await order(o.id))!.status).toBe("pending_payment");
    expect((await payment(p!.id))!.status).toBe("pending");
  });

  it("a PAID slip order fails through failPaidOrder: order flagged, payment flagged, processed_by = admin", async () => {
    const { order: o, payment: p } = await create();
    await f.tx((tx) => markPaid(tx, f.tenantId, p!.id, { verifiedBy: "admin" }));
    const r = await f.tx((tx) => adminFailOrder(tx, f.tenantId, o.id, "ลูกค้ากรอก UID ผิด", actor));
    expect(r.ok && r.value.refundRequired && !r.value.refunded).toBe(true);
    const after = await order(o.id);
    expect(after!.status).toBe("failed");
    expect(after!.processedBy).toBe(actor.userId);
    expect(paymentRefundRequired((await payment(p!.id))!)).toBe("ลูกค้ากรอก UID ผิด");
    const again = await f.tx((tx) => adminFailOrder(tx, f.tenantId, o.id, "อีกครั้ง", actor));
    expect(!again.ok && again.code).toBe("closed");
  });
});

describe("adminCancelOrder goes through cancelPayment (ADMIN-04, SERVICES-14)", () => {
  it("payment cancelled + one payment.cancelled + one topup.cancelled; audit row", async () => {
    const { order: o, payment: p } = await create();
    const r = await f.tx((tx) => adminCancelOrder(tx, f.tenantId, o.id, "ลูกค้าไม่โอน", actor));
    expect(r.ok && r.value.status).toBe("cancelled");
    expect((await payment(p!.id))!.status).toBe("cancelled");
    expect((await outbox("payment.cancelled")).filter((e) => e.payload.paymentId === p!.id)).toHaveLength(1);
    const ev = (await outbox("topup.cancelled")).filter((e) => e.payload.orderId === o.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ gameName: "Test Legends", by: "admin", reason: "ลูกค้าไม่โอน" });
    const audits = await f.tx((tx) => tx.select().from(auditLogs).where(and(eq(auditLogs.tenantId, f.tenantId), eq(auditLogs.targetId, o.id), eq(auditLogs.action, "topup.cancel"))));
    expect(audits).toHaveLength(1);
  });

  it("an expired payment stays expired; a slip under review needs allowSlipPending", async () => {
    const a = await create();
    await f.tx((tx) => tx.update(payments).set({ status: "expired" }).where(eq(payments.id, a.payment!.id)));
    const r1 = await f.tx((tx) => adminCancelOrder(tx, f.tenantId, a.order.id, null, actor));
    expect(r1.ok).toBe(true);
    expect((await payment(a.payment!.id))!.status).toBe("expired");

    const b = await create();
    await f.tx((tx) => attachSlip(tx, f.tenantId, b.payment!.id, { url: "/uploads/s.png" }));
    const refused = await f.tx((tx) => adminCancelOrder(tx, f.tenantId, b.order.id, null, actor));
    expect(!refused.ok && refused.code).toBe("slip_pending");
    expect(!refused.ok && refused.error).toContain("สลิปรอตรวจ");
    const forced = await f.tx((tx) => adminCancelOrder(tx, f.tenantId, b.order.id, null, actor, { allowSlipPending: true }));
    expect(forced.ok).toBe(true);
    expect((await payment(b.payment!.id))!.status).toBe("cancelled");
    const paidCancel = await f.tx((tx) => adminCancelOrder(tx, f.tenantId, b.order.id, null, actor));
    expect(!paidCancel.ok && paidCancel.code).toBe("not_pending");
  });
});

describe("adminRejectSlip on a closed payment (ADMIN-05)", () => {
  it("cancelled / paid / already rejected → friendly result, never a PaymentStateError", async () => {
    const a = await create();
    await f.tx((tx) => adminCancelOrder(tx, f.tenantId, a.order.id, null, actor));
    const r1 = await f.tx((tx) => adminRejectSlip(tx, f.tenantId, a.order.id, "สลิปไม่ถูกต้อง", actor));
    expect(r1).toMatchObject({ ok: false, code: "bad_status", error: "รายการชำระเงินนี้ปิดแล้ว" });

    const b = await create();
    await f.tx((tx) => markPaid(tx, f.tenantId, b.payment!.id, { verifiedBy: "admin" }));
    const r2 = await f.tx((tx) => adminRejectSlip(tx, f.tenantId, b.order.id, "x", actor));
    expect(r2).toMatchObject({ ok: false, code: "already" });

    const c = await create();
    await f.tx((tx) => attachSlip(tx, f.tenantId, c.payment!.id, { url: "/uploads/s.png" }));
    const ok1 = await f.tx((tx) => adminRejectSlip(tx, f.tenantId, c.order.id, "ยอดไม่ตรง", actor));
    expect(ok1.ok).toBe(true);
    expect((await payment(c.payment!.id))!.status).toBe("failed");
    const twice = await f.tx((tx) => adminRejectSlip(tx, f.tenantId, c.order.id, "ยอดไม่ตรง", actor));
    expect(twice).toMatchObject({ ok: false, code: "already" });
  });
});

describe("stock import never creates a second row for a known code (ADMIN-06)", () => {
  it("normalised keyed hash, per tenant", () => {
    expect(normalizeStockCode(" abcd-efgh 12 ")).toBe("ABCDEFGH12");
    expect(stockCodeHash("t1", "abcd-efgh")).toBe(stockCodeHash("t1", "ABCDEFGH"));
    expect(stockCodeHash("t1", "ABCD")).not.toBe(stockCodeHash("t2", "ABCD"));
  });

  it("re-import, variants, codes already sold and other packages are skipped and reported; legacy rows are backfilled", async () => {
    // the fixture seeds 2 codes WITHOUT code_hash (pre-0010 rows): the import backfills them first
    const first = await f.tx((tx) => importStockCodes(tx, f.tenantId, f.stockPackageId, ["QA-DUP-AAAA-BBBB", "qa-dup-aaaa-bbbb", "CODE-1-XXXX"], { actor }));
    expect(first.ok && first.value).toMatchObject({ imported: 1, inPaste: 1, existing: { inStock: 1, sold: 0, void: 0 }, duplicates: 2 });
    const rows = await codes(f.stockPackageId);
    expect(rows.every((r) => !!r.codeHash)).toBe(true);
    const again = await f.tx((tx) => importStockCodes(tx, f.tenantId, f.stockPackageId, ["QA-DUP-AAAA-BBBB"], { actor }));
    expect(again.ok && again.value).toMatchObject({ imported: 0, duplicates: 1, existing: { inStock: 1 } });
    expect(again.ok && stockImportMessage(again.value)).toContain("ไม่ได้นำเข้าโค้ดใหม่");
    expect((await codes(f.stockPackageId)).length).toBe(rows.length);

    // a code that was sold: buy one by wallet (the fixture codes share created_at, so read which one), then re-import it
    const sold = await create({ packageId: f.stockPackageId, paymentMethod: "wallet" });
    expect(sold.order.status).toBe("fulfilled");
    const soldCode = decryptFromString((await order(sold.order.id))!.deliveredCodeEncrypted!);
    const re = await f.tx((tx) => importStockCodes(tx, f.tenantId, f.stockPackageId, [soldCode], { actor }));
    expect(re.ok && re.value).toMatchObject({ imported: 0, existing: { sold: 1 } });

    // the same code cannot go into another stock package of the shop either (DB unique index per tenant)
    const otherPkg = await f.tx(async (tx) => (await tx.insert(gamePackages).values({ tenantId: f.tenantId, gameId: f.gameId, name: "Gift 2", price: 5000, fulfillment: "stock" }).returning({ id: gamePackages.id }))[0]!.id);
    const cross = await f.tx((tx) => importStockCodes(tx, f.tenantId, otherPkg, ["QA-DUP-AAAA-BBBB", "NEW-CODE-1"], { actor }));
    expect(cross.ok && cross.value).toMatchObject({ imported: 1, existing: { inStock: 1 } });
    await expect(
      f.tx((tx) => tx.insert(codeStock).values({ tenantId: f.tenantId, packageId: otherPkg, codeEncrypted: encryptToString("NEW-CODE-1"), codeHash: stockCodeHash(f.tenantId, "NEW-CODE-1") })),
    ).rejects.toThrow();
  });

  it("backfill voids an unsold duplicate written before the fix (the sold / older row keeps the hash)", async () => {
    await f.tx((tx) =>
      tx.insert(codeStock).values([
        { tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("LEGACY-DUP-1") },
        { tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("LEGACY-DUP-1") },
      ]),
    );
    const r = await f.tx((tx) => backfillStockCodeHashes(tx, f.tenantId, actor));
    expect(r).toMatchObject({ hashed: 1, voidedDuplicates: 1 });
    const legacy = (await codes(f.stockPackageId)).filter((c) => c.codeHash === stockCodeHash(f.tenantId, "LEGACY-DUP-1") || c.codeHash?.startsWith("dup:"));
    expect(legacy.map((c) => c.status).sort()).toEqual(["available", "void"]);
  });
});

describe("deleting a package / game with unsold codes is refused (ADMIN-07)", () => {
  it("has_stock with the count; the codes survive; void codes go with the package; the FK is RESTRICT", async () => {
    const pkg = await f.tx(async (tx) => (await tx.insert(gamePackages).values({ tenantId: f.tenantId, gameId: f.gameId, name: "Temp stock", price: 5000, fulfillment: "stock" }).returning({ id: gamePackages.id }))[0]!.id);
    await f.tx((tx) => importStockCodes(tx, f.tenantId, pkg, ["TMP-1", "TMP-2"], { actor }));
    const refused = await f.tx((tx) => deletePackage(tx, f.tenantId, pkg, actor));
    expect(!refused.ok && refused.code).toBe("has_stock");
    expect(!refused.ok && refused.error).toContain("2 โค้ด");
    expect((await codes(pkg)).length).toBe(2);
    // the DB itself refuses too (no silent cascade)
    await expect(f.tx((tx) => tx.delete(gamePackages).where(eq(gamePackages.id, pkg)))).rejects.toThrow();
    for (const c of await codes(pkg)) await f.tx((tx) => voidStockCode(tx, f.tenantId, c.id, actor));
    const done = await f.tx((tx) => deletePackage(tx, f.tenantId, pkg, actor));
    expect(done.ok).toBe(true);
    expect((await codes(pkg)).length).toBe(0);
  });

  it("deleteGame counts the codes of all its packages", async () => {
    const g = await f.tx(async (tx) => {
      const [game] = await tx.insert(games).values({ tenantId: f.tenantId, name: "Temp game", slug: "temp-game", category: "voucher" }).returning({ id: games.id });
      const [p] = await tx.insert(gamePackages).values({ tenantId: f.tenantId, gameId: game!.id, name: "Temp", price: 5000, fulfillment: "stock" }).returning({ id: gamePackages.id });
      return { id: game!.id, pkg: p!.id };
    });
    await f.tx((tx) => importStockCodes(tx, f.tenantId, g.pkg, ["GAME-TMP-1"], { actor }));
    const refused = await f.tx((tx) => deleteGame(tx, f.tenantId, g.id, actor));
    expect(!refused.ok && refused.code).toBe("has_stock");
    expect((await codes(g.pkg)).length).toBe(1);
  });
});

describe("manual refund of a failed non-wallet order (SERVICES-15, ADMIN-12)", () => {
  it("retry needs an explicit ack while the refund is pending; บันทึกว่าคืนเงินแล้ว refunds the payment and closes the order; no retry afterwards", async () => {
    // an api order paid by slip, then failed by the admin → refund pending
    const { order: o, payment: p } = await create({ packageId: f.apiPackageId });
    await f.tx((tx) => tx.update(topupOrders).set({ status: "pending_payment" }).where(eq(topupOrders.id, o.id)));
    await f.tx((tx) => markPaid(tx, f.tenantId, p!.id, { verifiedBy: "admin" }));
    await f.tx((tx) => tx.update(topupOrders).set({ status: "processing" }).where(eq(topupOrders.id, o.id)));
    const failed = await f.tx((tx) => adminFailOrder(tx, f.tenantId, o.id, "supplier_failed", actor));
    expect(failed.ok && failed.value.refundRequired).toBe(true);

    const noAck = await f.tx((tx) => adminRetryOrder(tx, f.tenantId, o.id, actor));
    expect(!noAck.ok && noAck.code).toBe("refund_pending");
    expect((await order(o.id))!.status).toBe("failed");

    const r = await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, o.id, { note: "โอนคืน KBank 12:30" }, actor));
    expect(r.ok && r.value.status).toBe("refunded");
    const after = await order(o.id);
    expect(after!.supplierResponse).toMatchObject({ refundRequired: false, refunded: "manual", refundedBy: actor.userId, refundNote: "โอนคืน KBank 12:30", refundedAmount: o.price });
    const pay = await payment(p!.id);
    expect(pay!.status).toBe("refunded");
    expect(pay!.refundedAmount).toBe(pay!.amount);
    expect((await outbox("payment.refunded")).filter((e) => e.payload.paymentId === p!.id)).toHaveLength(1);
    expect((await outbox("topup.refunded")).filter((e) => e.payload.orderId === o.id)).toHaveLength(1);
    const audits = await f.tx((tx) => tx.select().from(auditLogs).where(and(eq(auditLogs.tenantId, f.tenantId), eq(auditLogs.targetId, o.id), eq(auditLogs.action, "topup.refund"))));
    expect(audits).toHaveLength(1);

    const retry = await f.tx((tx) => adminRetryOrder(tx, f.tenantId, o.id, actor, { ackRefundPending: true }));
    expect(!retry.ok && retry.code).toBe("refunded");
    const twice = await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, o.id, {}, actor));
    expect(!twice.ok && twice.code).toBe("already");
    const detail = await f.tx((tx) => getAdminTopupOrder(tx, f.tenantId, o.id));
    expect(detail!.refund).toMatchObject({ note: "โอนคืน KBank 12:30", amount: o.price });
    expect(detail!.timeline.some((t) => t.label.startsWith("บันทึกว่าคืนเงินแล้ว"))).toBe(true);
  });

  it("only failed + flagged orders can be marked refunded; a pending refund can still be retried with the ack", async () => {
    const { order: o } = await create({ packageId: f.manualPackageId });
    const r = await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, o.id, {}, actor));
    expect(!r.ok && r.code).toBe("bad_status");

    const { order: s, payment: sp } = await create({ packageId: f.apiPackageId });
    await f.tx((tx) => markPaid(tx, f.tenantId, sp!.id, { verifiedBy: "admin" }));
    await f.tx((tx) => tx.update(topupOrders).set({ status: "processing" }).where(eq(topupOrders.id, s.id)));
    await f.tx((tx) => adminFailOrder(tx, f.tenantId, s.id, "supplier_failed", actor));
    const retried = await f.tx((tx) => adminRetryOrder(tx, f.tenantId, s.id, actor, { ackRefundPending: true }));
    expect(retried.ok && retried.value.status).toBe("fulfilled");
    expect(paymentRefundRequired((await payment(sp!.id))!)).toBeNull();
  });
});

describe("proof image + fulfilled event payload (ADMIN-02, ADMIN-13)", () => {
  it("only this tenant's relative topup-proof uploads are accepted; the event carries names + contact", async () => {
    const own = `/uploads/tenants/${f.tenantId}/topup-proof/1792347349322-niXoXqGr5ZECnxD4.png`;
    expect(isOwnProofImage(f.tenantId, own)).toBe(true);
    expect(isOwnProofImage(f.tenantId, `http://localhost:3001${own}`)).toBe(false);
    expect(isOwnProofImage(f.tenantId, own.replace(".png", ".svg"))).toBe(false);
    expect(isOwnProofImage(f.tenantId, `/uploads/tenants/00000000-0000-4000-8000-000000000000/topup-proof/x.png`)).toBe(false);

    const { order: o, payment: p } = await create({ packageId: f.manualPackageId });
    await f.tx((tx) => markPaid(tx, f.tenantId, p!.id, { verifiedBy: "admin" }));
    const bad = await f.tx((tx) => adminFulfillOrder(tx, f.tenantId, o.id, { proofImage: "https://evil.example/x.svg" }, actor));
    expect(!bad.ok && bad.code).toBe("proof");
    const good = await f.tx((tx) => adminFulfillOrder(tx, f.tenantId, o.id, { proofImage: own, deliveredCode: "GIFT-1" }, actor));
    expect(good.ok && good.value.proofImage).toBe(own);
    const ev = (await outbox("topup.fulfilled")).find((e) => e.payload.orderId === o.id);
    expect(ev?.payload).toMatchObject({ gameName: "Test Legends", packageName: "Manual Pack", manual: true, hasCode: true, proofImage: own, contact: "0812345678" });
    expect(JSON.stringify(ev?.payload)).not.toContain("GIFT-1");
  });
});

describe("one definition of 'paid orders today' (ADMIN-10)", () => {
  it("topupKpis.count counts only sale statuses (not unpaid / cancelled / failed / refunded)", async () => {
    const since = new Date(Date.now() - 3_600_000);
    const k = await f.tx((tx) => topupKpis(tx, f.tenantId, since));
    const [r] = await f.tx((tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(topupOrders)
        .where(and(eq(topupOrders.tenantId, f.tenantId), sql`${topupOrders.placedAt} >= ${since}`, sql`${topupOrders.status} in ('paid','processing','fulfilled')`)),
    );
    expect(TOPUP_SALE_STATUSES).toEqual(["paid", "processing", "fulfilled"]);
    expect(k.count).toBe(Number(r!.n));
    const [all] = await f.tx((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(topupOrders).where(eq(topupOrders.tenantId, f.tenantId)));
    expect(k.count).toBeLessThan(Number(all!.n));
    expect(wallets).toBeTruthy();
  });
});

describe("saving a game keeps the player-field format rules (services hand-off, STOREFRONT-12)", () => {
  it("gameSchema + createGame persist pattern / hint / length / inputMode; image refs must be https or /uploads", async () => {
    const { gameSchema } = await import("../src/admin/schemas");
    const { createGame } = await import("../src/admin");
    const parsed = gameSchema.parse({
      name: "Genshin QA",
      slug: "genshin-qa",
      category: "pc",
      image: "/uploads/tenants/x/games/a.png",
      fields: [{ key: "uid", label: "UID", type: "text", required: true, pattern: "\d{9,10}", hint: "ตัวเลข 9–10 หลัก", minLength: "9", maxLength: "10", inputMode: "numeric" }],
      featured: false,
      active: true,
      sort: 0,
    });
    const r = await f.tx((tx) => createGame(tx, f.tenantId, parsed, actor));
    expect(r.ok).toBe(true);
    const [g] = await f.tx((tx) => tx.select().from(games).where(and(eq(games.tenantId, f.tenantId), eq(games.slug, "genshin-qa"))));
    expect(g!.fields[0]).toMatchObject({ pattern: "\d{9,10}", hint: "ตัวเลข 9–10 หลัก", minLength: 9, maxLength: 10, inputMode: "numeric" });
    expect(gameSchema.safeParse({ ...parsed, image: "javascript:alert(1)" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...parsed, image: "//evil.example/x.png" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...parsed, image: "https://images.unsplash.com/photo-1?w=600" }).success).toBe(true);
  });
});

describe("code_stock FK still lets a whole tenant be deleted (demo reset / provision rollback)", () => {
  it("deleting the tenant cascades through games → packages → codes", async () => {
    const g = await makeFixture({ stockCodes: 3 });
    const { tenants } = await import("@rentweb/db");
    await g.db.delete(tenants).where(eq(tenants.id, g.tenantId));
    const left = await g.db.select({ n: sql<number>`count(*)::int` }).from(codeStock).where(eq(codeStock.tenantId, g.tenantId));
    expect(Number(left[0]!.n)).toBe(0);
  });
});
