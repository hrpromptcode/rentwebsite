import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { codeStock, gamePackages, games, nextCounter, payments, topupOrders, type Tx } from "@rentweb/db";
import { audit, decryptFromString, emitEvent, fail, normalizeThaiPhone, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { createPayment, markPaid, refundPayment, resolvePromptpayId } from "@rentweb/core/payments";
import { maskPlayerId, randomRef, rowsOf, type Fulfillment, type TopupModuleConfig, type TopupOrderStatus, type TopupPaymentMethod, DEFAULT_TOPUP_CONFIG } from "./_shared";
import { blacklistChecksFor, findBlacklisted } from "./blacklist";
import { getPackage, priceFor, validatePlayerFields, countAvailableStock } from "./catalog";
import { creditWallet, debitWallet, getWallet } from "./wallet";

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

const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

async function countRecentOrders(tx: Tx, tenantId: string, who: { customerId?: string | null; ip?: string | null }): Promise<number> {
  const conds = [];
  if (who.customerId) conds.push(eq(topupOrders.customerId, who.customerId));
  if (who.ip) conds.push(eq(topupOrders.ip, who.ip));
  if (!conds.length) return 0;
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), gt(topupOrders.placedAt, new Date(Date.now() - ACTIVE_WINDOW_MS)), or(...conds)!));
  return Number(row?.n ?? 0);
}

/**
 * Places a top-up order. Wallet orders are paid + fulfilled inside this call; PromptPay / slip orders
 * return a pending payment for <PaymentPanel/>. All expected failures come back as Result codes.
 */
export async function createTopupOrder(tx: Tx, tenantId: string, input: CreateTopupOrderInput): Promise<Result<CreateTopupOrderResult>> {
  const cfg = { ...DEFAULT_TOPUP_CONFIG, ...(input.config ?? {}) };

  const [game] = await tx
    .select()
    .from(games)
    .where(and(eq(games.tenantId, tenantId), eq(games.slug, input.gameSlug), eq(games.active, true)))
    .limit(1);
  if (!game) return fail("game_not_found", "game_not_found");
  const pkg = await getPackage(tx, tenantId, input.packageId);
  if (!pkg || !pkg.active || pkg.gameId !== game.id) return fail("package_not_found", "package_not_found");

  const fields = validatePlayerFields(game.fields ?? [], input.playerFields ?? {});
  if (!fields.ok) return fail(fields.code, fields.code);
  const playerFields = fields.value;

  const contact = input.contact?.trim() || null;
  const blacklisted = await findBlacklisted(tx, tenantId, blacklistChecksFor({ contact, ip: input.ip, playerFields }));
  if (blacklisted) {
    await audit(tx, { tenantId, actorType: "system", action: "topup.blocked", targetType: "topup_blacklist", targetId: blacklisted.id, diff: { kind: blacklisted.kind, gameSlug: input.gameSlug }, ip: input.ip ?? null });
    return fail("blacklisted", "blacklisted");
  }

  const recent = await countRecentOrders(tx, tenantId, { customerId: input.customer?.id, ip: input.ip });
  if (cfg.maxOrdersPerHour > 0 && recent >= cfg.maxOrdersPerHour) return fail("rate_limited", "rate_limited");

  // attach a customer: signed-in, or a guest row from the contact (phone / email)
  let customerId: string | null = input.customer?.id ?? null;
  let tier: string | null = input.customer?.tier ?? null;
  if (!customerId && contact) {
    const phone = normalizeThaiPhone(contact);
    const email = contact.includes("@") ? contact.toLowerCase() : null;
    if (phone || email) {
      const guest = await upsertGuestCustomer(tx, tenantId, { phone, email });
      customerId = guest?.id ?? null;
      tier = null; // guests always pay the member price
    }
  }
  if (input.paymentMethod === "wallet" && !input.customer?.id) return fail("login_required", "login_required");

  const price = priceFor(pkg, tier);
  const fulfillment = (pkg.fulfillment as Fulfillment) ?? "manual";
  if (fulfillment === "stock" && (await countAvailableStock(tx, tenantId, pkg.id)) <= 0) return fail("out_of_stock", "out_of_stock");

  const riskFlags: string[] = [];
  let riskScore = 0;
  if (!input.customer?.id) {
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
  if (recent >= 3) {
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
  await emitEvent(tx, { tenantId, type: "topup.created", payload: { orderId, number, customerId, gameId: game.id, packageId: pkg.id, price, paymentMethod: input.paymentMethod, riskScore } });

  let payment: Payment;
  if (input.paymentMethod === "wallet") {
    payment = await createPayment(tx, tenantId, { refType: "topup", refId: orderId, amount: price, provider: "wallet", method: "wallet", customerId });
    await tx.update(topupOrders).set({ paymentId: payment.id }).where(eq(topupOrders.id, orderId));
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
      expiresMinutes: 30,
      metadata: { number },
    });
    await tx.update(topupOrders).set({ paymentId: payment.id }).where(eq(topupOrders.id, orderId));
  }

  const [fresh] = await tx.select().from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, orderId))).limit(1);
  return ok({ order: fresh ?? order!, payment, accessKey });
}

export async function getOrderById(tx: Tx, tenantId: string, id: string): Promise<TopupOrder | null> {
  const [row] = await tx.select().from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, id))).limit(1);
  return row ?? null;
}

/**
 * Payment handler for refType "topup". Idempotent: only a pending_payment order transitions to paid,
 * then fulfilment runs (api → simulated, stock → pop one code, manual → queue).
 */
export async function onTopupPaid(tx: Tx, payment: Payment): Promise<void> {
  const tenantId = payment.tenantId;
  const order = await getOrderById(tx, tenantId, payment.refId);
  if (!order) return;
  if (order.status !== "pending_payment") return;
  await tx
    .update(topupOrders)
    .set({ status: "paid", paidAt: new Date(), paymentId: order.paymentId ?? payment.id })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)));
  await emitEvent(tx, { tenantId, type: "topup.paid", payload: { orderId: order.id, number: order.number, customerId: order.customerId, price: order.price, paymentId: payment.id } });
  await fulfillOrder(tx, tenantId, order.id);
}

/** Runs the fulfilment strategy for a paid order. Safe to call again – non-paid orders are ignored. */
export async function fulfillOrder(tx: Tx, tenantId: string, orderId: string): Promise<TopupOrder | null> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order || order.status !== "paid") return order;

  if (order.fulfillment === "api") {
    await tx.update(topupOrders).set({ status: "processing" }).where(eq(topupOrders.id, order.id));
    // Simulated supplier: real adapters live behind topup_suppliers.provider (generic_http …).
    const supplierRef = randomRef("SIM-", 6);
    const [done] = await tx
      .update(topupOrders)
      .set({ status: "fulfilled", fulfilledAt: new Date(), supplierRef, supplierResponse: { simulated: true, provider: "simulator", at: new Date().toISOString() }, processedBy: "system" })
      .where(eq(topupOrders.id, order.id))
      .returning();
    await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: { orderId: order.id, number: order.number, customerId: order.customerId, fulfillment: "api", supplierRef } });
    return done ?? null;
  }

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
    if (!code) return failOrder(tx, tenantId, order.id, "out_of_stock");
    await tx
      .update(codeStock)
      .set({ status: "sold", soldOrderId: order.id, soldAt: new Date() })
      .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, code.id)));
    const [done] = await tx
      .update(topupOrders)
      .set({ status: "fulfilled", fulfilledAt: new Date(), deliveredCodeEncrypted: code.code_encrypted, supplierRef: code.serial ?? null, supplierResponse: { source: "stock", stockId: code.id }, processedBy: "system" })
      .where(eq(topupOrders.id, order.id))
      .returning();
    await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: { orderId: order.id, number: order.number, customerId: order.customerId, fulfillment: "stock" } });
    const remaining = await countAvailableStock(tx, tenantId, order.packageId);
    if (remaining <= 3) await emitEvent(tx, { tenantId, type: "topup.stock_low", payload: { packageId: order.packageId, remaining } });
    return done ?? null;
  }

  // manual: queue for staff; admin marks fulfilled with proof
  const [queued] = await tx.update(topupOrders).set({ status: "processing" }).where(eq(topupOrders.id, order.id)).returning();
  await emitEvent(tx, { tenantId, type: "topup.processing", payload: { orderId: order.id, number: order.number, fulfillment: "manual" } });
  return queued ?? null;
}

/**
 * Marks an order failed and refunds: wallet payments are credited back (idempotent key topup_refund:<id>)
 * and the order becomes "refunded"; other methods are flagged for a manual refund by staff.
 */
export async function failOrder(tx: Tx, tenantId: string, orderId: string, reason: string): Promise<TopupOrder | null> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return null;
  if (order.status === "failed" || order.status === "refunded" || order.status === "cancelled") return order;

  let status: TopupOrderStatus = "failed";
  let supplierResponse: Record<string, unknown> = { ...(order.supplierResponse ?? {}), failedAt: new Date().toISOString(), reason };
  const paid = order.status !== "pending_payment";

  if (paid && order.paymentMethod === "wallet" && order.customerId) {
    const refund = await creditWallet(tx, tenantId, {
      customerId: order.customerId,
      amount: order.price,
      reason: "refund",
      refType: "topup_order",
      refId: order.id,
      idempotencyKey: `topup_refund:${order.id}`,
      note: `คืนเงิน ${order.number} (${reason})`,
    });
    if (!refund.ok) throw new Error(`refund failed: ${refund.error}`);
    status = "refunded";
    supplierResponse = { ...supplierResponse, refunded: "wallet", refundTransactionId: refund.value.transaction.id };
    if (order.paymentId) await refundPayment(tx, tenantId, order.paymentId, order.price, reason);
  } else if (paid) {
    supplierResponse = { ...supplierResponse, refundRequired: true, refundVia: order.paymentMethod };
  }

  const [updated] = await tx
    .update(topupOrders)
    .set({ status, failureReason: reason, supplierResponse, processedBy: "system" })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.failed", payload: { orderId: order.id, number: order.number, customerId: order.customerId, reason, refunded: status === "refunded" } });
  return updated ?? null;
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
  paymentMethod: string;
  failureReason: string | null;
  placedAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  estimatedMinutes: number | null;
}

function primaryPlayerId(fields: Record<string, string>): string {
  return fields.uid ?? fields.riotid ?? fields.username ?? fields.contact ?? Object.values(fields)[0] ?? "";
}

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
  };
}

/** Public status lookup by order number – never includes codes, contact or raw player ids. */
export async function getOrderByNumber(tx: Tx, tenantId: string, number: string): Promise<PublicOrder | null> {
  const [row] = await tx
    .select({ order: topupOrders, estimatedMinutes: gamePackages.estimatedMinutes })
    .from(topupOrders)
    .leftJoin(gamePackages, eq(gamePackages.id, topupOrders.packageId))
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.number, number.trim().toUpperCase())))
    .limit(1);
  return row ? toPublicOrder(row.order, row.estimatedMinutes ?? null) : null;
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
    .leftJoin(games, eq(games.id, topupOrders.gameId))
    .where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.status, ["paid", "processing", "fulfilled"])))
    .orderBy(desc(topupOrders.paidAt), desc(topupOrders.placedAt))
    .limit(Math.min(Math.max(limit, 1), 30));
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
