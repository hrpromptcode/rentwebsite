import "../../load-env";
import "../../../apps/web/src/modules";
// drizzle operators come via @rentweb/db re-exports
import { and, eq, inArray, sql, codeStock, customers, getDb, topupOrders, wallets, withTenant, type Tx } from "@rentweb/db";
import { getPayment, markPaid, paymentRefundRequired } from "../../../packages/core/src/payments";
import {
  blacklistChecksFor, createTopupOrder, createWalletTopup, creditWallet, debitWallet, failOrder, getOrCreateWallet, getWallet,
  normalizeBlacklistValue, topupConfig, getOrderById,
} from "../../../packages/modules/topup/src/services";
import { adjustWallet, adminCancelOrder, adminRetryOrder } from "../../../packages/modules/topup/src/admin";

/** Proof probes for topup_services bughunt. MSYS_NO_PATHCONV=1 pnpm --silent exec tsx qa/bughunt/topup_services-proof.ts <test|all> */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579"; // demo-topup
const PKG_API = "01a1401c-bc33-708f-abac-122aa25de837"; // rov 40 coupons 3500 api
const PKG_STOCK300 = "01a1401c-c0e6-77ff-a44e-78ffee747b9c"; // steam 300 31900 stock (5)
const PKG_STOCK100 = "01a1401c-c0e6-77ff-a44e-7431f178febf"; // steam 100 10900 stock (13)
const QA_PHONE = "0891234501";
const SETTINGS = { payments: { promptpayId: "0899998888", promptpayName: "QA", bankAccounts: [{ bank: "KTB", name: "QA", number: "111-2-33333-4" }], enabled: { promptpay: true, bankTransfer: true, wallet: true } } };
const CFG = topupConfig({ walletEnabled: true, walletBonusPercent: 2, minWalletTopup: 2000, otpRequiredFirstOrder: false, maxOrdersPerHour: 10 });
const db = getDb();
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
const out = (name: string, data: unknown) => console.log(`RESULT ${name} ${JSON.stringify(data)}`);
class Rollback extends Error {}
async function rb(fn: (tx: Tx) => Promise<void>) {
  try {
    await withTenant(db, T, async (tx) => {
      await fn(tx);
      throw new Rollback("rb");
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
async function outbox(tx: Tx, types: string[]) {
  return rows(await tx.execute(sql`select type, payload from events_outbox where tenant_id = ${T} and type in ${types} and created_at > now() - interval '2 minutes' order by created_at`));
}
async function qaCustomer(tx: Tx, tier = "member") {
  const [c] = await tx.select().from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, QA_PHONE))).limit(1);
  if (c) {
    if (c.tier !== tier || c.blockedAt) await tx.update(customers).set({ tier, blockedAt: null }).where(eq(customers.id, c.id));
    return c.id;
  }
  const [n] = await tx.insert(customers).values({ tenantId: T, phone: QA_PHONE, name: "QA Services", tier }).returning({ id: customers.id });
  return n!.id;
}
const which = process.argv[2] ?? "all";
const run = (n: string) => which === "all" || which === n;
const PF = { uid: "123456789", server: "Asia" };

async function main() {
  const cid = await withTenant(db, T, (tx) => qaCustomer(tx));

  if (run("failed-then-paid"))
    await rb(async (tx) => {
      const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG });
      if (!r.ok) return out("failed-then-paid", { createFailed: r });
      const o = r.value.order;
      const failed = await failOrder(tx, T, o.id, "qa: admin failed while unpaid");
      const pAfterFail = await getPayment(tx, T, o.paymentId!);
      let err: string | null = null;
      let paid: any = null;
      try {
        paid = await markPaid(tx, T, o.paymentId!, { verifiedBy: "qa-admin" });
      } catch (e) {
        err = String((e as Error).message);
      }
      const after = await getOrderById(tx, T, o.id);
      out("failed-then-paid", {
        orderStatusAfterFail: failed?.status,
        paymentStatusAfterFail: pAfterFail?.status,
        markPaidError: err,
        paymentStatus: paid?.status,
        refundFlag: paid ? paymentRefundRequired(paid) : null,
        orderStatusAfterPaid: after?.status,
        orderSupplierResponse: after?.supplierResponse,
        events: (await outbox(tx, ["payment.refund_required", "payment.paid", "topup.paid"])).map((e: any) => e.type),
      });
    });

  if (run("oos-paid"))
    await rb(async (tx) => {
      const r = await createTopupOrder(tx, T, { gameSlug: "steam-wallet", packageId: PKG_STOCK300, playerFields: { contact: QA_PHONE }, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG });
      if (!r.ok) return out("oos-paid", { createFailed: r });
      const o = r.value.order;
      await tx.update(codeStock).set({ status: "reserved" }).where(and(eq(codeStock.tenantId, T), eq(codeStock.packageId, PKG_STOCK300), eq(codeStock.status, "available")));
      const paid = await markPaid(tx, T, o.paymentId!, { verifiedBy: "qa-admin" });
      const after = await getOrderById(tx, T, o.id);
      out("oos-paid", {
        paymentStatus: paid.status,
        paymentRefundFlag: paymentRefundRequired(paid),
        paymentFailureReason: paid.failureReason,
        orderStatus: after?.status,
        orderSupplierResponse: after?.supplierResponse,
        events: (await outbox(tx, ["payment.refund_required", "topup.failed"])).map((e: any) => e.type),
      });
    });

  if (run("frozen-wallet-topup"))
    await rb(async (tx) => {
      const r = await createWalletTopup(tx, T, { customerId: cid, amount: 5000, method: "slip", settings: SETTINGS, bonusPercent: 2, minAmount: 2000 });
      if (!r.ok) return out("frozen-wallet-topup", { createFailed: r });
      const w = await getWallet(tx, T, cid);
      await tx.update(wallets).set({ frozen: true }).where(eq(wallets.id, w!.id));
      let err: string | null = null;
      let p: any = null;
      try {
        p = await markPaid(tx, T, r.value.payment.id, { verifiedBy: "auto", strict: true });
      } catch (e) {
        err = String((e as Error).message);
      }
      out("frozen-wallet-topup", { bonusStored: r.value.topup.bonus, markPaidThrew: err, paymentStatus: p?.status, refundFlag: p ? paymentRefundRequired(p) : null });
    });

  if (run("blocked"))
    await rb(async (tx) => {
      await tx.update(customers).set({ blockedAt: new Date() }).where(eq(customers.id, cid));
      const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG });
      const g = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: null, settings: SETTINGS, config: CFG });
      out("blocked", {
        signedInBlocked: r.ok ? { ok: true, status: r.value.order.status, number: r.value.order.number } : r,
        guestWithBlockedPhone: g.ok ? { ok: true, customerId: g.value.order.customerId, sameAsBlocked: g.value.order.customerId === cid } : g,
      });
    });

  if (run("method-disabled"))
    await rb(async (tx) => {
      const settings = { payments: { enabled: { promptpay: false, bankTransfer: false, wallet: false } } };
      const cfgNoWallet = { ...CFG, walletEnabled: false };
      const q = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "promptpay_qr", contact: QA_PHONE, customer: { id: cid }, settings, config: cfgNoWallet });
      const s = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid }, settings, config: cfgNoWallet });
      await creditWallet(tx, T, { customerId: cid, amount: 3500, reason: "adjustment", idempotencyKey: `qa-md-${Date.now()}` });
      const w = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "wallet", contact: QA_PHONE, customer: { id: cid }, settings, config: cfgNoWallet });
      out("method-disabled", {
        promptpayDisabled: q.ok ? { ok: true, provider: q.value.payment?.provider, promptpayId: q.value.payment?.promptpayId } : q,
        slipDisabled: s.ok ? { ok: true, provider: s.value.payment?.provider } : s,
        walletDisabled: w.ok ? { ok: true, status: w.value.order.status } : w,
      });
    });

  if (run("otp-guest-row"))
    await rb(async (tx) => {
      const phone = "0867778899";
      const before = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, phone)));
      const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: phone, customer: null, settings: SETTINGS, config: { ...CFG, otpRequiredFirstOrder: true } });
      const after = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, phone)));
      out("otp-guest-row", { result: r.ok ? "ok" : r.code, guestRowsBefore: before.length, guestRowsAfter: after.length });
    });

  if (run("rate-limit"))
    await rb(async (tx) => {
      const cfg = { ...CFG, maxOrdersPerHour: 2 };
      const mk = (ip: string | null, customer: { id: string } | null, contact: string | null) =>
        createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact, customer, settings: SETTINGS, config: cfg, ip });
      const a = await mk("10.9.9.9", { id: cid }, QA_PHONE);
      const b = await mk("10.9.9.9", { id: cid }, QA_PHONE);
      const c = await mk("10.9.9.9", { id: cid }, QA_PHONE);
      const g1 = await mk(null, null, null);
      const g2 = await mk(null, null, null);
      const g3 = await mk(null, null, null);
      const g4 = await mk(null, null, null);
      out("rate-limit", {
        customer: [a, b, c].map((x) => (x.ok ? "ok" : x.code)),
        guestNoIpNoContact: [g1, g2, g3, g4].map((x) => (x.ok ? `ok:${x.value.order.riskFlags.join("+")}` : x.code)),
      });
    });

  if (run("tier-bonus"))
    await rb(async (tx) => {
      const vip = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid, tier: "vip" }, settings: SETTINGS, config: CFG });
      const member = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid, tier: "member" }, settings: SETTINGS, config: CFG });
      const guest = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: null, settings: SETTINGS, config: CFG });
      const b1 = await createWalletTopup(tx, T, { customerId: cid, amount: 2001, method: "slip", settings: SETTINGS, bonusPercent: 2, minAmount: 2000 });
      const b2 = await createWalletTopup(tx, T, { customerId: cid, amount: 2050, method: "slip", settings: SETTINGS, bonusPercent: 2, minAmount: 2000 });
      const b3 = await createWalletTopup(tx, T, { customerId: cid, amount: 1999, method: "slip", settings: SETTINGS, bonusPercent: 2, minAmount: 2000 });
      const b4 = await createWalletTopup(tx, T, { customerId: cid, amount: 2000, method: "slip", settings: SETTINGS, bonusPercent: 2.5, minAmount: 2000 });
      out("tier-bonus", {
        vipPrice: vip.ok ? vip.value.order.price : vip.code,
        memberPrice: member.ok ? member.value.order.price : member.code,
        guestPriceWithVipPhone: guest.ok ? guest.value.order.price : guest.code,
        guestCustomerId: guest.ok ? guest.value.order.customerId === cid : null,
        bonus2001: b1.ok ? b1.value.topup.bonus : b1.code,
        bonus2050: b2.ok ? b2.value.topup.bonus : b2.code,
        belowMin: b3.ok ? "ok" : b3.code,
        bonus2000at2_5pct: b4.ok ? b4.value.topup.bonus : b4.code,
      });
    });

  if (run("cancel-event"))
    await rb(async (tx) => {
      const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "slip", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG });
      if (!r.ok) return out("cancel-event", r);
      const c = await adminCancelOrder(tx, T, r.value.order.id, "qa cancel", { userId: "qa", actorType: "user" });
      const p = await getPayment(tx, T, r.value.order.paymentId!);
      out("cancel-event", { cancel: c.ok ? c.value.status : c, paymentStatus: p?.status, events: (await outbox(tx, ["payment.cancelled", "topup.cancelled"])).map((e: any) => e.type) });
    });

  if (run("api-retry"))
    await rb(async (tx) => {
      await creditWallet(tx, T, { customerId: cid, amount: 3500, reason: "adjustment", idempotencyKey: `qa-ar-${Date.now()}` });
      const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: PF, paymentMethod: "wallet", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG });
      if (!r.ok) return out("api-retry", r);
      const first = await getOrderById(tx, T, r.value.order.id);
      await tx.update(topupOrders).set({ status: "processing" }).where(eq(topupOrders.id, first!.id)); // "supplier call in flight / unknown result"
      const retry = await adminRetryOrder(tx, T, first!.id, { userId: "qa", actorType: "user" });
      out("api-retry", { firstStatus: first?.status, firstRef: first?.supplierRef, retry: retry.ok ? { status: retry.value.status, ref: retry.value.supplierRef, resp: retry.value.supplierResponse } : retry });
    });

  if (run("blacklist")) {
    const forms = ["0812345678", "081-234-5678", "+66 81 234 5678", "66812345678", " 0812345678 ", "+66812345678", "081 234 5678", "0812345678\t"];
    const norm = forms.map((f) => normalizeBlacklistValue("phone", f));
    const checks = blacklistChecksFor({ contact: "  Foo@Example.COM ", ip: "1.2.3.4", playerFields: { uid: "ABC123", server: "Asia", riotid: "Player#TH1" } });
    const lineContact = blacklistChecksFor({ contact: "@mylineid", ip: null, playerFields: {} });
    out("blacklist", {
      phoneForms: Object.fromEntries(forms.map((f, i) => [JSON.stringify(f), norm[i]])),
      allSame: new Set(norm).size === 1,
      checks,
      lineContact,
      email: normalizeBlacklistValue("email", " Foo@Example.COM "),
      uid: normalizeBlacklistValue("uid", " ABC123 "),
      ip: normalizeBlacklistValue("ip", " 1.2.3.4 "),
    });
  }

  if (run("wallet-parallel")) {
    await withTenant(db, T, async (tx) => {
      const w = await getOrCreateWallet(tx, T, cid);
      await tx.update(wallets).set({ frozen: false }).where(eq(wallets.id, w.id));
      if (w.balance < 5000) await creditWallet(tx, T, { customerId: cid, amount: 5000 - w.balance, reason: "adjustment", idempotencyKey: `qa-wp-${Date.now()}` });
      else if (w.balance > 5000) await debitWallet(tx, T, { customerId: cid, amount: w.balance - 5000, reason: "adjustment", idempotencyKey: `qa-wp-${Date.now()}` });
    });
    const k = `qa-par-${Date.now()}`;
    const res = await Promise.allSettled([1, 2].map((i) => withTenant(db, T, (tx) => debitWallet(tx, T, { customerId: cid, amount: 3000, reason: "purchase", idempotencyKey: `${k}-${i}` }))));
    const bal = await withTenant(db, T, (tx) => getWallet(tx, T, cid));
    out("wallet-parallel", { results: res.map((r) => (r.status === "fulfilled" ? (r.value.ok ? `ok:${r.value.value.balance}` : r.value.code) : `throw:${String((r.reason as Error).message).slice(0, 80)}`)), balance: bal?.balance });
  }

  if (run("adjust-double")) {
    const w = await withTenant(db, T, (tx) => getOrCreateWallet(tx, T, cid));
    const key = `dbl-${Date.now()}`;
    const res = await Promise.allSettled([1, 2].map(() => withTenant(db, T, (tx) => adjustWallet(tx, T, w.id, { type: "credit", amount: 100, reason: "qa double submit", requestKey: key }, { userId: "qa", actorType: "user" }))));
    const n = await withTenant(db, T, async (tx) => rows(await tx.execute(sql`select count(*)::int n from wallet_transactions where tenant_id = ${T} and idempotency_key = ${`adjust:${w.id}:${key}`}`)));
    out("adjust-double", { results: res.map((r) => (r.status === "fulfilled" ? (r.value.ok ? `ok dup=${r.value.value.duplicate} bal=${r.value.value.balance}` : `fail:${r.value.code}`) : `throw:${String((r.reason as Error).message).slice(0, 160)}`)), ledgerRows: n });
  }

  if (run("stock-race")) {
    const reserved = await withTenant(db, T, async (tx) => {
      const avail = await tx.select({ id: codeStock.id }).from(codeStock).where(and(eq(codeStock.tenantId, T), eq(codeStock.packageId, PKG_STOCK100), eq(codeStock.status, "available"))).orderBy(codeStock.createdAt);
      const ids = avail.slice(1).map((a) => a.id);
      if (ids.length) await tx.update(codeStock).set({ status: "reserved" }).where(inArray(codeStock.id, ids));
      const w = await getOrCreateWallet(tx, T, cid);
      if (w.balance < 21800) await creditWallet(tx, T, { customerId: cid, amount: 21800 - w.balance, reason: "adjustment", idempotencyKey: `qa-sr-${Date.now()}` });
      return ids;
    });
    try {
      const res = await Promise.allSettled(
        [1, 2].map(() => withTenant(db, T, (tx) => createTopupOrder(tx, T, { gameSlug: "steam-wallet", packageId: PKG_STOCK100, playerFields: { contact: QA_PHONE }, paymentMethod: "wallet", contact: QA_PHONE, customer: { id: cid }, settings: SETTINGS, config: CFG }))),
      );
      const summary = res.map((r) => (r.status === "fulfilled" ? (r.value.ok ? { number: r.value.value.order.number, status: r.value.value.order.status, code: r.value.value.order.deliveredCodeEncrypted ? "has-code" : null, resp: r.value.value.order.supplierResponse } : r.value.code) : `throw:${String((r.reason as Error).message).slice(0, 160)}`));
      const ids = res.flatMap((r) => (r.status === "fulfilled" && r.value.ok ? [r.value.value.order.id] : []));
      const sold = ids.length ? await withTenant(db, T, async (tx) => rows(await tx.execute(sql`select sold_order_id, status from code_stock where tenant_id = ${T} and package_id = ${PKG_STOCK100} and sold_order_id in ${ids}`))) : [];
      const pays = ids.length ? await withTenant(db, T, async (tx) => rows(await tx.execute(sql`select ref_id, status, failure_reason, provider_payload->'refundRequired' flag from payments where tenant_id = ${T} and ref_type='topup' and ref_id in ${ids}`))) : [];
      const bal = await withTenant(db, T, (tx) => getWallet(tx, T, cid));
      out("stock-race", { orders: summary, soldCodes: sold, payments: pays, balanceAfter: bal?.balance });
    } finally {
      if (reserved.length) await withTenant(db, T, (tx) => tx.update(codeStock).set({ status: "available" }).where(inArray(codeStock.id, reserved)));
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
