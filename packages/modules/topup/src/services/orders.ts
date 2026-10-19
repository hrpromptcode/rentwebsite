import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { codeStock, gamePackages, games, nextCounter, payments, topupOrders, topupSuppliers, type Tx } from "@rentweb/db";
import { audit, decryptFromString, emitEvent, fail, isUuid, normalizeThaiPhone, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { CUSTOMER_BLOCKED_CODE, CUSTOMER_BLOCKED_MESSAGE, isCustomerBlocked } from "@rentweb/core/customer";
import {
  cancelPayment,
  createPayment,
  enabledMethods,
  getPayment,
  isOpenPaymentStatus,
  isPaymentStateError,
  markPaid,
  paymentRefundRequired,
  paymentSettings,
  refundPayment,
  refundRequired,
  resolvePromptpayId,
  type PaymentAccessProof,
  type PaymentAccessVia,
  type PaymentClosedInfo,
  type PaymentPaidResult,
} from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { ORDER_STATUS_LABEL } from "../labels";
import { maskPlayerId, rowsOf, type Fulfillment, type TopupModuleConfig, type TopupOrderStatus, type TopupPaymentMethod, DEFAULT_TOPUP_CONFIG } from "./_shared";
import { blacklistChecksFor, findBlacklisted } from "./blacklist";
import { getPackage, priceFor, validatePlayerFields, countAvailableStock } from "./catalog";
import { creditWallet, debitWallet } from "./wallet";
import { flagTopupPaymentRefund } from "./refund-flag";
import { callSupplier, supplierAdapterFor, supplierIdempotencyKey, type SupplierAttempt, type SupplierOutcome } from "./suppliers";

export type TopupOrder = typeof topupOrders.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export interface CreateTopupOrderInput {
  gameSlug: string;
  packageId: string;
  playerFields: Record<string, unknown>;
  paymentMethod: TopupPaymentMethod;
  /** phone / LINE id / email used for delivery notification (required for guests) */
  contact?: string | null;
  /** signed-in customer (null for guests) */
  customer?: { id: string; tier?: string | null } | null;
  ip?: string | null;
  userAgent?: string | null;
  /** tenant settings (payments block) */
  settings: Record<string, unknown>;
  config?: Partial<TopupModuleConfig>;
}

export interface CreateTopupOrderResult {
  order: TopupOrder;
  payment: Payment | null;
  /** random key stored in topup_orders.device_id – lets guests open /topup/<number>?k=<key> */
  accessKey: string;
}

/**
 * `result.code` of a refused createTopupOrder. `result.error` is specific Thai copy for customer_blocked,
 * contact_required and player-field errors (missing_field / invalid_field: names the field and its format);
 * for every other code it equals the code. UI: show `result.error` when it differs from `result.code`.
 */
export type CreateTopupOrderCode =
  | "game_not_found"
  | "package_not_found"
  | "method_disabled"
  | "missing_field"
  | "invalid_field"
  | "otp_required"
  | "login_required"
  | "contact_required"
  | "customer_blocked"
  | "blacklisted"
  | "rate_limited"
  | "out_of_stock"
  | "insufficient"
  | "frozen"
  | "invalid_amount";

/**
 * The player-field key of a missing_field / invalid_field refusal (e.g. "uid"), so the form can mark that input;
 * undefined for every other refusal. (createTopupOrder attaches it as an extra `field` property of the Result.)
 */
export function topupFailureField(result: { ok: boolean }): string | undefined {
  const f = (result as { field?: unknown }).field;
  return !result.ok && typeof f === "string" ? f : undefined;
}

const ACTIVE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED_STATUSES = new Set<string>(["failed", "refunded", "cancelled"]);

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Contact as stored on the order: Thai phone → 0XXXXXXXXX, e-mail → lower case, anything else (LINE id) trimmed. */
export function normalizeTopupContact(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const phone = normalizeThaiPhone(v);
  if (phone) return phone;
  if (EMAIL_RE.test(v)) return v.toLowerCase();
  return v.slice(0, 120);
}

/** The phone / e-mail inside a stored contact (LINE ids give neither). */
export function contactParts(contact: string | null | undefined): { phone: string | null; email: string | null } {
  const v = (contact ?? "").trim();
  if (!v) return { phone: null, email: null };
  return { phone: normalizeThaiPhone(v), email: EMAIL_RE.test(v) ? v.toLowerCase() : null };
}

/**
 * Methods a top-up order may be paid with (SERVICES-08), same rule as the game page: the shop's payment settings
 * (PromptPay needs a PromptPay ID, slip needs a bank account, wallet needs settings.payments.enabled.wallet) AND,
 * for the wallet, moduleConfig.topup.walletEnabled.
 */
export function topupPaymentMethods(settings: Record<string, unknown>, config?: Partial<TopupModuleConfig> | null): TopupPaymentMethod[] {
  const cfg = { ...DEFAULT_TOPUP_CONFIG, ...(config ?? {}) };
  const enabled = enabledMethods(settings);
  const out: TopupPaymentMethod[] = [];
  if (cfg.walletEnabled && enabled.includes("wallet")) out.push("wallet");
  if (enabled.includes("promptpay_qr")) out.push("promptpay_qr");
  if (enabled.includes("slip")) out.push("slip");
  return out;
}

/**
 * Outbox payload for every topup.* event (SERVICES-02/03): what the notification handlers show and where they send it.
 * Every emitEvent("topup.*") — services AND admin/orders.ts — must build its payload with this helper.
 * `accessKey` is the guest link key (/topup/<number>?k=). Never put the delivered code in an event.
 */
export function topupEventPayload(order: TopupOrder, extras: Record<string, unknown> = {}): Record<string, unknown> {
  const { phone, email } = contactParts(order.contact);
  return {
    orderId: order.id,
    number: order.number,
    customerId: order.customerId,
    gameName: order.gameName,
    packageName: order.packageName,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    status: order.status,
    amount: order.price,
    price: order.price,
    contact: order.contact,
    phone,
    email,
    accessKey: order.deviceId ?? null,
    ...extras,
  };
}

/** Customer-facing Thai reason for a failure code stored in topup_orders.failure_reason. */
const FAILURE_TEXT: Record<string, string> = {
  out_of_stock: "สินค้าหมด",
  supplier_failed: "ผู้ให้บริการเติมไม่สำเร็จ",
};
export function topupFailureText(reason: string | null | undefined): string {
  const r = (reason ?? "").trim();
  return FAILURE_TEXT[r] ?? (r || "เติมไม่สำเร็จ");
}

async function lockOrder(tx: Tx, tenantId: string, id: string): Promise<TopupOrder | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, id)))
    .for("update");
  return row ?? null;
}

/**
 * Locks every payment row of the order BEFORE the order row (review RV-10). markPaid / cancelPayment lock the payment
 * first and the paid / closed handler then locks the order; a caller that locked the order first and then touched the
 * payment (cancel / renew vs. a concurrent slip approval) could deadlock. Same order as the events module.
 */
async function lockOrderPayments(tx: Tx, tenantId: string, orderId: string): Promise<void> {
  if (!isUuid(orderId)) return;
  await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "topup"), eq(payments.refId, orderId)))
    .for("update");
}

/** supplier_response without the marks of an earlier failure (kept: notes, attempts, retry trail …). */
function withoutFailure(sr: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const { refundRequired: _r, refundVia: _v, failedAt: _f, reason: _reason, refundError: _e, ...rest } = (sr ?? {}) as Record<string, unknown>;
  return rest;
}

// flagTopupPaymentRefund lives in refund-flag.ts (shared with wallet.ts without an import cycle); public API unchanged
export { flagTopupPaymentRefund } from "./refund-flag";

/** A failed order was fulfilled after all (admin retry): its payment no longer needs a refund. Keeps the old flag as refundCleared. */
async function clearTopupPaymentRefund(tx: Tx, tenantId: string, paymentId: string | null): Promise<void> {
  if (!paymentId) return;
  const p = await getPayment(tx, tenantId, paymentId);
  if (!p || p.status !== "paid") return;
  const payload = (p.providerPayload ?? {}) as Record<string, unknown>;
  if (!payload.refundRequired) return;
  const { refundRequired: flag, ...rest } = payload;
  await tx
    .update(payments)
    .set({ providerPayload: { ...rest, refundCleared: { ...(flag as Record<string, unknown>), clearedAt: new Date().toISOString() } }, failureReason: null })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, p.id)));
}

async function countRecentOrders(tx: Tx, tenantId: string, who: { customerId?: string | null; ip?: string | null; contact?: string | null }): Promise<number> {
  const conds: SQL[] = [];
  if (who.customerId) conds.push(eq(topupOrders.customerId, who.customerId));
  if (who.ip) conds.push(eq(topupOrders.ip, who.ip));
  if (who.contact) conds.push(eq(topupOrders.contact, who.contact));
  if (!conds.length) return 0;
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), gt(topupOrders.placedAt, new Date(Date.now() - ACTIVE_WINDOW_MS)), conds.length === 1 ? conds[0]! : or(...conds)!));
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/* Create                                                               */
/* ------------------------------------------------------------------ */

/**
 * Places a top-up order. Wallet orders are paid + fulfilled inside this call; PromptPay / slip orders
 * return a pending payment for <PaymentPaidPanel/>. All expected failures come back as Result codes (CreateTopupOrderCode).
 *
 * Every refusal happens before anything is written (only a blacklist hit writes its audit row): payment method,
 * player fields, OTP gate, wallet login, contact, blocked customer, blacklist, hourly limit, stock.
 * Guests (no signed-in customer) never get a customers row and the order is never attached to an existing
 * customer whose phone / e-mail they typed (STOREFRONT-05): customer_id stays null, the typed contact is stored
 * on the order and the guest opens it with the access key.
 */
export async function createTopupOrder(tx: Tx, tenantId: string, input: CreateTopupOrderInput): Promise<Result<CreateTopupOrderResult>> {
  const cfg = { ...DEFAULT_TOPUP_CONFIG, ...(input.config ?? {}) };
  const customerId = input.customer?.id ?? null;

  const [game] = await tx
    .select()
    .from(games)
    .where(and(eq(games.tenantId, tenantId), eq(games.slug, input.gameSlug), eq(games.active, true)))
    .limit(1);
  if (!game) return fail("game_not_found", "game_not_found");
  const pkg = await getPackage(tx, tenantId, input.packageId);
  if (!pkg || !pkg.active || pkg.gameId !== game.id) return fail("package_not_found", "package_not_found");

  // payment method the shop actually accepts (a crafted POST cannot pick a disabled one)
  if (!topupPaymentMethods(input.settings, cfg).includes(input.paymentMethod)) return fail("method_disabled", "method_disabled");

  const fields = validatePlayerFields(game.fields ?? [], input.playerFields ?? {});
  if (!fields.ok) return Object.assign(fail(fields.message, fields.code), { field: fields.key });
  const playerFields = fields.value;

  if (!customerId && cfg.otpRequiredFirstOrder) return fail("otp_required", "otp_required");
  if (input.paymentMethod === "wallet" && !customerId) return fail("login_required", "login_required");

  const contact = normalizeTopupContact(input.contact);
  if (!customerId && !contact) return fail("กรุณากรอกเบอร์โทร อีเมล หรือ LINE ID สำหรับติดตามรายการ", "contact_required");
  const { phone, email } = contactParts(contact);

  // shop-blocked customer: the signed-in one, or a guest typing a blocked customer's phone / e-mail (SERVICES-04)
  if (await isCustomerBlocked(tx, tenantId, { customerId, phone, email })) return fail(CUSTOMER_BLOCKED_MESSAGE, CUSTOMER_BLOCKED_CODE);

  const blacklisted = await findBlacklisted(tx, tenantId, blacklistChecksFor({ contact, ip: input.ip, playerFields }));
  if (blacklisted) {
    await audit(tx, { tenantId, actorType: "system", action: "topup.blocked", targetType: "topup_blacklist", targetId: blacklisted.id, diff: { kind: blacklisted.kind, gameSlug: input.gameSlug }, ip: input.ip ?? null });
    return fail("blacklisted", "blacklisted");
  }

  // hourly limit: signed-in → per customer + IP; guest → per IP + contact (never skipped: a guest always has a contact)
  const recent = await countRecentOrders(tx, tenantId, customerId ? { customerId, ip: input.ip } : { ip: input.ip, contact });
  if (cfg.maxOrdersPerHour > 0 && recent >= cfg.maxOrdersPerHour) return fail("rate_limited", "rate_limited");

  const tier = customerId ? (input.customer?.tier ?? null) : null; // guests always pay the member price
  const price = priceFor(pkg, tier);
  const fulfillment = (pkg.fulfillment as Fulfillment) ?? "manual";
  if (fulfillment === "stock" && (await countAvailableStock(tx, tenantId, pkg.id)) <= 0) return fail("out_of_stock", "out_of_stock");

  const riskFlags: string[] = [];
  let riskScore = 0;
  if (!customerId) {
    riskFlags.push("guest");
    riskScore += 10;
  }
  if (!contact) {
    riskFlags.push("no_contact");
    riskScore += 10;
  }
  if (price >= 100_000) {
    riskFlags.push("high_value");
    riskScore += 20;
  }
  const recentFromIp = input.ip ? await countRecentOrders(tx, tenantId, { ip: input.ip }) : 0;
  if (recentFromIp >= 3) {
    riskFlags.push("repeat_ip");
    riskScore += 15;
  }

  const orderId = randomUUID();
  const accessKey = randomToken(18);

  // wallet: debit first (idempotent on the order id) so a failed debit leaves no order behind
  if (input.paymentMethod === "wallet") {
    const debit = await debitWallet(tx, tenantId, {
      customerId: customerId!,
      amount: price,
      reason: "purchase",
      refType: "topup_order",
      refId: orderId,
      idempotencyKey: `topup:${orderId}`,
      note: `${game.name} · ${pkg.name}`,
    });
    if (!debit.ok) return fail(debit.error, debit.code);
  }

  const number = `TP-${await nextCounter(tx, tenantId, "topup", 1000)}`;
  const [order] = await tx
    .insert(topupOrders)
    .values({
      id: orderId,
      tenantId,
      number,
      customerId,
      gameId: game.id,
      packageId: pkg.id,
      gameName: game.name,
      packageName: pkg.name,
      playerFields,
      status: "pending_payment",
      placedAt: new Date(), // same clock as paidAt / fulfilledAt (DB now() may be skewed)
      price,
      costPrice: pkg.costPrice ?? null,
      paymentMethod: input.paymentMethod,
      fulfillment,
      supplierId: pkg.supplierId ?? null,
      contact,
      ip: input.ip ?? null,
      deviceId: accessKey,
      riskScore,
      riskFlags,
    })
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.created", payload: topupEventPayload(order!, { gameId: game.id, packageId: pkg.id, riskScore }) });

  let payment: Payment;
  if (input.paymentMethod === "wallet") {
    payment = await createPayment(tx, tenantId, { refType: "topup", refId: orderId, amount: price, provider: "wallet", method: "wallet", customerId });
    await tx.update(topupOrders).set({ paymentId: payment.id }).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, orderId)));
    payment = await markPaid(tx, tenantId, payment.id, { verifiedBy: "wallet" }); // runs onTopupPaid → fulfil
  } else {
    payment = await createPayment(tx, tenantId, {
      refType: "topup",
      refId: orderId,
      amount: price,
      provider: input.paymentMethod === "promptpay_qr" ? "promptpay" : "bank_transfer",
      method: input.paymentMethod,
      customerId,
      promptpayId: resolvePromptpayId(input.settings) ?? undefined,
      expiresMinutes: paymentSettings(input.settings).expiresMinutes ?? 30,
      metadata: { number },
    });
    await tx.update(topupOrders).set({ paymentId: payment.id }).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, orderId)));
  }

  const [fresh] = await tx.select().from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, orderId))).limit(1);
  return ok({ order: fresh ?? order!, payment, accessKey });
}

export async function getOrderById(tx: Tx, tenantId: string, id: string): Promise<TopupOrder | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, id))).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Payment hooks (registered in handlers.ts)                            */
/* ------------------------------------------------------------------ */

/**
 * registerPaymentHandler("topup") – money arrived. A pending_payment order becomes paid and is fulfilled
 * (api → supplier adapter, stock → one code, manual → queue). Never throws for business reasons and never
 * swallows money silently: whenever the money cannot be applied it returns refundRequired(reason) so markPaid
 * flags the payment (SERVICES-05/06, STOREFRONT-09): order missing / closed / already paid by another payment,
 * short payment, or fulfilment failed right away (stock gone, supplier rejected) for a non-wallet payment.
 * Idempotent: a re-run for the payment that already paid the order is a no-op.
 */
export async function onTopupPaid(tx: Tx, payment: Payment): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  // row lock: concurrent markPaid / reconcile calls serialise here and the later one sees "paid"
  const order = await lockOrder(tx, tenantId, payment.refId);
  if (!order) return refundRequired("ไม่พบรายการเติมเกม");
  if (order.status !== "pending_payment") {
    if (order.paymentId === payment.id && !CLOSED_STATUSES.has(order.status)) return undefined; // already applied
    if (!CLOSED_STATUSES.has(order.status)) return refundRequired(`ชำระซ้ำ: รายการ ${order.number} ชำระเงินแล้ว`);
    return refundRequired(`รายการ ${order.number} ${ORDER_STATUS_LABEL[order.status] ?? order.status}แล้ว`);
  }
  if (payment.amount < order.price) return refundRequired(`ยอดชำระไม่ครบ (ได้รับ ${thb(payment.amount)} จาก ${thb(order.price)})`);
  if (order.paymentId && order.paymentId !== payment.id) {
    // money arrived on another payment of this still-unpaid order: apply it, void the untouched current one
    // (a current payment with a slip under review is left for the shop – approving it later flags "ชำระซ้ำ")
    const current = await getPayment(tx, tenantId, order.paymentId);
    if (current && current.status === "pending") await cancelPayment(tx, tenantId, current.id, "ชำระผ่านรายการชำระเงินอื่นแล้ว", { runHandler: false });
  }
  const [paid] = await tx
    .update(topupOrders)
    .set({ status: "paid", paidAt: new Date(), paymentId: payment.id })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.paid", payload: topupEventPayload(paid!, { paymentId: payment.id }) });
  const done = await fulfillOrder(tx, tenantId, order.id, { deferPaymentFlag: true });
  const sr = (done?.supplierResponse ?? {}) as Record<string, unknown>;
  if (done && done.status === "failed" && sr.refundRequired === true) return refundRequired(topupFailureText(done.failureReason));
  return undefined;
}

/**
 * registerPaymentClosedHandler("topup") – an unpaid payment expired (sweep) or was cancelled (cancelPayment):
 * the pending order is cancelled when this payment is still its current one. No stock is held for unpaid orders
 * (codes are taken at fulfilment), so nothing else to release. Idempotent.
 */
export async function onTopupPaymentClosed(tx: Tx, payment: Payment, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const order = await lockOrder(tx, tenantId, payment.refId);
  if (!order || order.status !== "pending_payment") return;
  if (order.paymentId && order.paymentId !== payment.id) return; // superseded payment
  const reason = info.status === "expired" ? "หมดเวลาชำระเงิน" : info.reason || "ยกเลิกรายการชำระเงิน";
  const [updated] = await tx
    .update(topupOrders)
    .set({ status: "cancelled", failureReason: reason, processedBy: "system", supplierResponse: { ...((order.supplierResponse ?? {}) as Record<string, unknown>), cancelledAt: new Date().toISOString(), cancelledBy: "system", paymentClosed: info.status } })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.cancelled", payload: topupEventPayload(updated!, { reason, by: "system", expired: info.status === "expired", paymentId: payment.id }) });
}

/** registerPaymentTargetCheck("topup") – money for a closed order is flagged for a refund instead of fulfilling it. */
export async function topupOrderClosedReason(tx: Tx, payment: Payment): Promise<string | null> {
  if (!isUuid(payment.refId)) return null;
  const [o] = await tx.select({ status: topupOrders.status, number: topupOrders.number }).from(topupOrders).where(and(eq(topupOrders.tenantId, payment.tenantId), eq(topupOrders.id, payment.refId))).limit(1);
  if (!o || !CLOSED_STATUSES.has(o.status)) return null;
  return `รายการ ${o.number} ${ORDER_STATUS_LABEL[o.status] ?? o.status}แล้ว`;
}

/** registerPaymentAccessCheck("topup") – the order's signed-in owner or the holder of its access key (?k=). */
export async function topupPaymentAccess(tx: Tx, payment: Payment, proof: PaymentAccessProof): Promise<PaymentAccessVia | false | null> {
  if (!isUuid(payment.refId)) return false;
  const [o] = await tx.select({ customerId: topupOrders.customerId, deviceId: topupOrders.deviceId }).from(topupOrders).where(and(eq(topupOrders.tenantId, payment.tenantId), eq(topupOrders.id, payment.refId))).limit(1);
  if (!o) return false;
  if (proof.customerId && o.customerId && proof.customerId === o.customerId) return "customer";
  if (proof.accessKey && o.deviceId && safeEqual(o.deviceId, proof.accessKey)) return "access_key";
  return false;
}

/* ------------------------------------------------------------------ */
/* Fulfilment                                                           */
/* ------------------------------------------------------------------ */

export interface FulfillOptions {
  /** set by the paid handler: a failure is reported through its refundRequired result (markPaid flags the payment) */
  deferPaymentFlag?: boolean;
}

/** Runs the fulfilment strategy for a paid order. Safe to call again – non-paid orders are returned unchanged. */
export async function fulfillOrder(tx: Tx, tenantId: string, orderId: string, opts: FulfillOptions = {}): Promise<TopupOrder | null> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order || order.status !== "paid") return order;
  const prev = (order.supplierResponse ?? {}) as Record<string, unknown>;
  const recovering = prev.refundRequired === true; // a failed order retried by the shop

  if (order.fulfillment === "api") return fulfilViaSupplier(tx, tenantId, order, opts);

  if (order.fulfillment === "stock") {
    const popped = rowsOf<{ id: string; code_encrypted: string; serial: string | null }>(
      await tx.execute(sql`
        select id, code_encrypted, serial
        from code_stock
        where tenant_id = ${tenantId}
          and package_id = ${order.packageId}
          and status = 'available'
          and (expires_at is null or expires_at > now())
        order by created_at asc
        limit 1
        for update skip locked
      `),
    );
    const code = popped[0];
    if (!code) return failOrder(tx, tenantId, order.id, "out_of_stock", opts);
    await tx
      .update(codeStock)
      .set({ status: "sold", soldOrderId: order.id, soldAt: new Date() })
      .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, code.id)));
    const [done] = await tx
      .update(topupOrders)
      .set({ status: "fulfilled", fulfilledAt: new Date(), failureReason: null, deliveredCodeEncrypted: code.code_encrypted, supplierRef: code.serial ?? null, supplierResponse: { ...withoutFailure(prev), source: "stock", stockId: code.id }, processedBy: "system" })
      .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
      .returning();
    if (recovering) await clearTopupPaymentRefund(tx, tenantId, order.paymentId);
    await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: topupEventPayload(done!) });
    const remaining = await countAvailableStock(tx, tenantId, order.packageId);
    if (remaining <= 3) await emitEvent(tx, { tenantId, type: "topup.stock_low", payload: { packageId: order.packageId, remaining, gameName: order.gameName, packageName: order.packageName } });
    return done ?? null;
  }

  // manual: queue for staff; admin marks fulfilled with proof
  const [queued] = await tx.update(topupOrders).set({ status: "processing" }).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id))).returning();
  await emitEvent(tx, { tenantId, type: "topup.processing", payload: topupEventPayload(queued!) });
  return queued ?? null;
}

/**
 * api fulfilment through the supplier adapter (contract: suppliers.ts). The idempotency key is the order's UUID (RV-02);
 * when an earlier attempt exists the supplier is queried first, so a retry never tops up twice. An unknown outcome
 * (timeout / transport error) keeps the order in processing with the attempt recorded.
 */
async function fulfilViaSupplier(tx: Tx, tenantId: string, order: TopupOrder, opts: FulfillOptions): Promise<TopupOrder | null> {
  const prev = (order.supplierResponse ?? {}) as Record<string, unknown>;
  const attempts: SupplierAttempt[] = Array.isArray(prev.attempts) ? [...(prev.attempts as SupplierAttempt[])] : [];
  const [supplier] = order.supplierId
    ? await tx.select({ id: topupSuppliers.id, provider: topupSuppliers.provider, config: topupSuppliers.config }).from(topupSuppliers).where(and(eq(topupSuppliers.tenantId, tenantId), eq(topupSuppliers.id, order.supplierId))).limit(1)
    : [];
  const [pkg] = await tx.select({ productCode: gamePackages.supplierProductCode }).from(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, order.packageId))).limit(1);
  const adapter = supplierAdapterFor(supplier?.provider);
  const key = supplierIdempotencyKey(order);
  const base = { ...withoutFailure(prev), provider: adapter.key, idempotencyKey: key, ...(adapter.key === "simulator" ? { simulated: true } : {}) };
  const save = async (set: Partial<typeof topupOrders.$inferInsert>) => {
    const [row] = await tx.update(topupOrders).set(set).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id))).returning();
    return row ?? null;
  };
  await save({ status: "processing" });

  const record = (action: SupplierAttempt["action"], o: SupplierOutcome): SupplierOutcome => {
    attempts.push({
      at: new Date().toISOString(),
      action,
      status: o.status,
      ...(o.status === "success" || o.status === "pending" ? { ref: o.ref ?? null } : {}),
      ...(o.status === "failed" ? { reason: o.reason } : {}),
      ...("raw" in o && o.raw ? { raw: o.raw } : {}),
    });
    return o;
  };
  const ctxFor = (signal: AbortSignal) => ({ tenantId, supplier: supplier ? { id: supplier.id, provider: supplier.provider, config: supplier.config ?? {} } : null, signal });
  const submit = () => callSupplier((signal) => adapter.submit({ idempotencyKey: key, orderNumber: order.number, productCode: pkg?.productCode ?? null, playerFields: order.playerFields ?? {}, amount: order.price }, ctxFor(signal)));

  let outcome: SupplierOutcome;
  let action: SupplierAttempt["action"] = attempts.length ? "query" : "submit";
  try {
    if (attempts.length) {
      // an earlier attempt may have reached the supplier: ask before submitting again
      outcome = record("query", await callSupplier((signal) => adapter.query(key, ctxFor(signal))));
      if (outcome.status === "not_found" || outcome.status === "failed") {
        action = "submit";
        outcome = record("submit", await submit());
      }
    } else {
      outcome = record("submit", await submit());
    }
  } catch (err) {
    attempts.push({ at: new Date().toISOString(), action, status: "unknown", error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300) });
    // outcome unknown → stay in processing; the shop retries (which queries first) or fulfils by hand
    return save({ supplierResponse: { ...base, attempts, lastError: attempts[attempts.length - 1]!.error, at: new Date().toISOString() } });
  }

  if (outcome.status === "success") {
    const done = await save({ status: "fulfilled", fulfilledAt: new Date(), failureReason: null, supplierRef: outcome.ref, supplierResponse: { ...base, attempts, at: new Date().toISOString() }, processedBy: "system" });
    if (prev.refundRequired === true) await clearTopupPaymentRefund(tx, tenantId, order.paymentId);
    if (done) await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: topupEventPayload(done, { supplierRef: outcome.ref }) });
    return done;
  }
  if (outcome.status === "pending" || outcome.status === "not_found") {
    return save({ supplierRef: outcome.status === "pending" ? (outcome.ref ?? order.supplierRef) : order.supplierRef, supplierResponse: { ...base, attempts, at: new Date().toISOString() } });
  }
  // definitive rejection: nothing was credited → fail (wallet refund / refund flag)
  await save({ supplierResponse: { ...base, attempts, supplierReason: outcome.reason } });
  return failOrder(tx, tenantId, order.id, "supplier_failed", opts);
}

/* ------------------------------------------------------------------ */
/* Failing / cancelling                                                 */
/* ------------------------------------------------------------------ */

export type FailTopupOrderError = "not_found" | "not_paid" | "closed";

export interface FailTopupOrderOptions extends FulfillOptions {
  /** user id (admin) or "system" stored in processed_by */
  by?: string | null;
}

export interface FailTopupOrderOutcome {
  order: TopupOrder;
  /** wallet payment credited back automatically (order → refunded, payment → refunded) */
  refunded: boolean;
  /** money must be returned by hand: order supplier_response.refundRequired AND the payment flagged (payment.refund_required) */
  refundRequired: boolean;
}

/**
 * Fails a PAID order (paid / processing / fulfilled) and settles the money:
 * - wallet payment → credited back (idempotency key topup_refund:<id>), order "refunded", payment refunded;
 *   a wallet that cannot take the credit (frozen) falls back to the manual-refund flag instead of throwing;
 * - other methods → order "failed" with supplier_response.refundRequired, and the PAYMENT is flagged
 *   (flagTopupPaymentRefund: providerPayload.refundRequired, failureReason "ต้องคืนเงิน: …", payment.refund_required)
 *   unless the caller is the paid handler (deferPaymentFlag – markPaid flags it from the handler's result).
 * Refuses an unpaid order with "not_paid" (cancel it with cancelUnpaidTopupOrder instead) and an already closed
 * (failed / refunded / cancelled) order with "closed".
 */
export async function failPaidOrder(tx: Tx, tenantId: string, orderId: string, reason: string, opts: FailTopupOrderOptions = {}): Promise<Result<FailTopupOrderOutcome, FailTopupOrderError>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status === "pending_payment") return fail("not_paid");
  if (CLOSED_STATUSES.has(order.status)) return fail("closed");

  let status: TopupOrderStatus = "failed";
  let refunded = false;
  let needsRefund = false;
  let supplierResponse: Record<string, unknown> = { ...((order.supplierResponse ?? {}) as Record<string, unknown>), failedAt: new Date().toISOString(), reason };

  if (order.paymentMethod === "wallet" && order.customerId) {
    const refund = await creditWallet(tx, tenantId, {
      customerId: order.customerId,
      amount: order.price,
      reason: "refund",
      refType: "topup_order",
      refId: order.id,
      idempotencyKey: `topup_refund:${order.id}`,
      note: `คืนเงิน ${order.number} (${topupFailureText(reason)})`,
    });
    if (refund.ok) {
      status = "refunded";
      refunded = true;
      supplierResponse = { ...supplierResponse, refunded: "wallet", refundTransactionId: refund.value.transaction.id };
      if (order.paymentId) {
        try {
          await refundPayment(tx, tenantId, order.paymentId, order.price, topupFailureText(reason));
        } catch (err) {
          if (!isPaymentStateError(err)) throw err; // already refunded
        }
      }
    } else {
      needsRefund = true;
      supplierResponse = { ...supplierResponse, refundRequired: true, refundVia: "wallet", refundError: refund.code ?? refund.error };
    }
  } else {
    needsRefund = true;
    supplierResponse = { ...supplierResponse, refundRequired: true, refundVia: order.paymentMethod };
  }

  const [updated] = await tx
    .update(topupOrders)
    .set({ status, failureReason: reason, supplierResponse, processedBy: opts.by ?? "system" })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  if (needsRefund && !opts.deferPaymentFlag && order.paymentId) await flagTopupPaymentRefund(tx, tenantId, order.paymentId, topupFailureText(reason));
  await emitEvent(tx, { tenantId, type: "topup.failed", payload: topupEventPayload(updated!, { reason, reasonText: topupFailureText(reason), refunded, refundRequired: needsRefund }) });
  return ok({ order: updated!, refunded, refundRequired: needsRefund });
}

/**
 * Legacy entry point (fulfilment strategies, older callers): fails a paid order like failPaidOrder. An UNPAID order
 * is never left with an open payment: it is cancelled through cancelUnpaidTopupOrder (payment voided via
 * cancelPayment) unless a slip is waiting for review (then nothing changes). Already closed orders are returned as
 * they are. New code (admin) should call failPaidOrder / cancelUnpaidTopupOrder and map their error codes.
 */
export async function failOrder(tx: Tx, tenantId: string, orderId: string, reason: string, opts: FailTopupOrderOptions = {}): Promise<TopupOrder | null> {
  const r = await failPaidOrder(tx, tenantId, orderId, reason, opts);
  if (r.ok) return r.value.order;
  if (r.error === "not_found") return null;
  if (r.error === "not_paid") {
    const c = await cancelUnpaidTopupOrder(tx, tenantId, orderId, { reason, by: "system", actorId: opts.by ?? null });
    if (c.ok) return c.value;
  }
  return getOrderById(tx, tenantId, orderId);
}

export type CancelTopupOrderError = "not_found" | "not_pending" | "slip_pending" | "paid";

/**
 * Cancels an UNPAID order and voids its open payment through the payment layer
 * (cancelPayment(…, { runHandler: false }) → payment cancelled + payment.cancelled), then emits topup.cancelled.
 * Errors: not_found; not_pending (order is past pending_payment); slip_pending (a slip is waiting for review –
 * pass allowSlipPending: true when the shop looked at it and still cancels); paid (the payment was confirmed
 * meanwhile – reconcile / fulfil instead).
 */
export async function cancelUnpaidTopupOrder(
  tx: Tx,
  tenantId: string,
  orderId: string,
  input: { reason?: string | null; by: "customer" | "admin" | "system"; actorId?: string | null; allowSlipPending?: boolean },
): Promise<Result<TopupOrder, CancelTopupOrderError>> {
  await lockOrderPayments(tx, tenantId, orderId);
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status !== "pending_payment") return fail("not_pending");
  const reason = input.reason?.trim() || (input.by === "admin" ? "ยกเลิกโดยแอดมิน" : input.by === "customer" ? "ลูกค้ายกเลิกรายการ" : "ยกเลิกรายการ");
  if (order.paymentId) {
    const p = await getPayment(tx, tenantId, order.paymentId);
    if (p) {
      if (p.status === "paid" || p.status === "refunded" || p.status === "partially_refunded") return fail("paid");
      if (p.status === "pending_verification" && !input.allowSlipPending) return fail("slip_pending");
      if (isOpenPaymentStatus(p.status) || p.status === "failed") {
        try {
          await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
        } catch (err) {
          if (isPaymentStateError(err)) return fail("paid"); // confirmed concurrently
          throw err;
        }
      }
    }
  }
  const [updated] = await tx
    .update(topupOrders)
    .set({ status: "cancelled", failureReason: reason, processedBy: input.actorId ?? input.by, supplierResponse: { ...((order.supplierResponse ?? {}) as Record<string, unknown>), cancelledAt: new Date().toISOString(), cancelledBy: input.actorId ?? input.by } })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.cancelled", payload: topupEventPayload(updated!, { reason, by: input.by }) });
  return ok(updated!);
}

export type RenewTopupPaymentError = "not_found" | "not_pending" | "payment_open" | "slip_pending" | "method_disabled" | "out_of_stock";

/**
 * True when the order's current payment can no longer take money from the customer: the shop rejected the slip
 * (failed), it expired / was cancelled, or a pending QR is past its expiry (the sweep closes it after the grace period).
 */
export function topupPaymentLapsed(payment: Pick<Payment, "status" | "expiresAt"> | null | undefined, now = new Date()): boolean {
  if (!payment) return true;
  if (payment.status === "failed" || payment.status === "expired" || payment.status === "cancelled") return true;
  return payment.status === "pending" && !!payment.expiresAt && payment.expiresAt.getTime() <= now.getTime();
}

/**
 * RV-03: a fresh payment for a pending order whose slip was rejected / whose QR lapsed (the customer's "ชำระเงินใหม่").
 * Without it a rejected slip left the order "รอชำระเงิน" forever: attachSlip refuses a failed payment and the expiry
 * sweep only closes pending ones. The old payment is voided (cancelPayment, runHandler false – the order stays open);
 * the new one gets the shop's normal expiry, so the sweep cancels the order if it is not paid either.
 * Refuses: not_pending (paid / closed meanwhile), payment_open (the current payment can still be paid), slip_pending
 * (a slip is under review), method_disabled (no QR / transfer method left), out_of_stock (stock package sold out).
 */
export async function renewTopupPayment(
  tx: Tx,
  tenantId: string,
  orderId: string,
  input: { settings: Record<string, unknown>; config?: Partial<TopupModuleConfig>; now?: Date },
): Promise<Result<{ order: TopupOrder; payment: Payment }, RenewTopupPaymentError>> {
  const now = input.now ?? new Date();
  await lockOrderPayments(tx, tenantId, orderId);
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status !== "pending_payment" || order.paymentMethod === "wallet") return fail("not_pending");
  const current = order.paymentId ? await getPayment(tx, tenantId, order.paymentId) : null;
  if (current?.status === "pending_verification") return fail("slip_pending");
  if (current && (current.status === "paid" || current.status === "partially_refunded" || current.status === "refunded")) return fail("not_pending");
  if (current && !topupPaymentLapsed(current, now)) return fail("payment_open");
  const methods = topupPaymentMethods(input.settings, input.config).filter((m): m is "promptpay_qr" | "slip" => m !== "wallet");
  const method = methods.includes(order.paymentMethod as "promptpay_qr" | "slip") ? (order.paymentMethod as "promptpay_qr" | "slip") : methods[0];
  if (!method) return fail("method_disabled");
  if (order.fulfillment === "stock" && (await countAvailableStock(tx, tenantId, order.packageId)) <= 0) return fail("out_of_stock");
  if (current && (current.status === "pending" || current.status === "failed")) {
    try {
      await cancelPayment(tx, tenantId, current.id, "ออกรายการชำระเงินใหม่", { runHandler: false });
    } catch (err) {
      if (isPaymentStateError(err)) return fail("not_pending"); // paid concurrently
      throw err;
    }
  }
  const payment = await createPayment(tx, tenantId, {
    refType: "topup",
    refId: order.id,
    amount: order.price,
    provider: method === "promptpay_qr" ? "promptpay" : "bank_transfer",
    method,
    customerId: order.customerId,
    promptpayId: resolvePromptpayId(input.settings) ?? undefined,
    expiresMinutes: paymentSettings(input.settings).expiresMinutes ?? 30,
    metadata: { number: order.number, renewedFrom: current?.id ?? null },
  });
  const [updated] = await tx
    .update(topupOrders)
    .set({ paymentId: payment.id, paymentMethod: method })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  return ok({ order: updated!, payment });
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface PublicOrder {
  number: string;
  status: TopupOrderStatus;
  gameName: string;
  packageName: string;
  fulfillment: Fulfillment;
  /** masked, e.g. 1234**** */
  player: string;
  price: number;
  /** "" in the redacted (no-proof) view */
  paymentMethod: string;
  /** null in the redacted (no-proof) view */
  failureReason: string | null;
  placedAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  estimatedMinutes: number | null;
  /** true for the public lookup by number (getOrderByNumber): payment method and failure reason are withheld */
  redacted: boolean;
}

function primaryPlayerId(fields: Record<string, string>): string {
  return fields.uid ?? fields.riotid ?? fields.username ?? fields.contact ?? Object.values(fields)[0] ?? "";
}

/** Status view for an AUTHORISED caller (owner / access key) – still no codes, contact or raw player ids. */
export function toPublicOrder(order: TopupOrder, estimatedMinutes: number | null = null): PublicOrder {
  return {
    number: order.number,
    status: order.status as TopupOrderStatus,
    gameName: order.gameName,
    packageName: order.packageName,
    fulfillment: order.fulfillment as Fulfillment,
    player: maskPlayerId(primaryPlayerId(order.playerFields ?? {})),
    price: order.price,
    paymentMethod: order.paymentMethod,
    failureReason: order.failureReason,
    placedAt: order.placedAt,
    paidAt: order.paidAt,
    fulfilledAt: order.fulfilledAt,
    estimatedMinutes,
    redacted: false,
  };
}

/** The no-proof view (SERVICES-13): what a status page needs, without payment method / failure reason. */
export function toRedactedPublicOrder(order: TopupOrder, estimatedMinutes: number | null = null): PublicOrder {
  return { ...toPublicOrder(order, estimatedMinutes), paymentMethod: "", failureReason: null, redacted: true };
}

/** Public status lookup by order number (no proof) – redacted: never codes, contact, raw player ids, payment method or failure reason. */
export async function getOrderByNumber(tx: Tx, tenantId: string, number: string): Promise<PublicOrder | null> {
  const [row] = await tx
    .select({ order: topupOrders, estimatedMinutes: gamePackages.estimatedMinutes })
    .from(topupOrders)
    .leftJoin(gamePackages, and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, topupOrders.packageId)))
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.number, number.trim().toUpperCase())))
    .limit(1);
  return row ? toRedactedPublicOrder(row.order, row.estimatedMinutes ?? null) : null;
}

/** Full order for its owner (signed-in customer) or the holder of the guest access key. */
export async function getOrderForCustomer(tx: Tx, tenantId: string, who: { number: string; customerId?: string | null; accessKey?: string | null }): Promise<TopupOrder | null> {
  const [order] = await tx
    .select()
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.number, who.number.trim().toUpperCase())))
    .limit(1);
  if (!order) return null;
  const ownsIt = !!who.customerId && order.customerId === who.customerId;
  const keyOk = !!who.accessKey && !!order.deviceId && safeEqual(order.deviceId, who.accessKey);
  return ownsIt || keyOk ? order : null;
}

/** Decrypts the delivered code – only call server-side for an authorised, fulfilled order. */
export function revealDeliveredCode(order: TopupOrder): string | null {
  if (order.status !== "fulfilled" || !order.deliveredCodeEncrypted) return null;
  try {
    return decryptFromString(order.deliveredCodeEncrypted);
  } catch {
    return null;
  }
}

export async function listCustomerOrders(tx: Tx, tenantId: string, customerId: string, opts: { limit?: number } = {}): Promise<TopupOrder[]> {
  return tx
    .select()
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.customerId, customerId)))
    .orderBy(desc(topupOrders.placedAt))
    .limit(opts.limit ?? 50);
}

export interface FeedItem {
  id: string;
  gameName: string;
  packageName: string;
  gameImage: string | null;
  player: string;
  status: TopupOrderStatus;
  at: Date;
}

/** Live "เติมล่าสุด" feed with masked player ids. Only orders that were paid. */
export async function recentFeed(tx: Tx, tenantId: string, limit = 10): Promise<FeedItem[]> {
  const rows = await tx
    .select({ order: topupOrders, gameImage: games.image })
    .from(topupOrders)
    .leftJoin(games, and(eq(games.tenantId, tenantId), eq(games.id, topupOrders.gameId)))
    .where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.status, ["paid", "processing", "fulfilled"])))
    .orderBy(desc(topupOrders.paidAt), desc(topupOrders.placedAt))
    .limit(Math.min(Math.max(Math.trunc(Number.isFinite(limit) ? limit : 10), 1), 30));
  return rows.map(({ order, gameImage }) => ({
    id: order.id,
    gameName: order.gameName,
    packageName: order.packageName,
    gameImage,
    player: maskPlayerId(primaryPlayerId(order.playerFields ?? {})),
    status: order.status as TopupOrderStatus,
    at: order.fulfilledAt ?? order.paidAt ?? order.placedAt,
  }));
}

/**
 * Self-healing read: when the order is still pending_payment but its payment row is already paid
 * (e.g. the slip was verified in a process where this module's paid handler was not registered),
 * run the paid handler now – and flag the payment when the handler refuses the money. Idempotent.
 */
export async function reconcileTopupOrder(tx: Tx, tenantId: string, order: TopupOrder): Promise<TopupOrder> {
  if (order.status !== "pending_payment" || !order.paymentId) return order;
  const payment = await getPayment(tx, tenantId, order.paymentId);
  if (!payment || payment.status !== "paid" || paymentRefundRequired(payment)) return order;
  const outcome = await onTopupPaid(tx, payment);
  if (outcome && typeof outcome === "object" && outcome.refundRequired) await flagTopupPaymentRefund(tx, tenantId, payment.id, outcome.refundRequired);
  return (await getOrderById(tx, tenantId, order.id)) ?? order;
}
