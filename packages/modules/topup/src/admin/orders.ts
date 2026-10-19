import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { auditLogs, customers, gamePackages, games, payments, topupOrders, topupSuppliers, type Tx } from "@rentweb/db";
import { audit, emitEvent, encryptToString, fail, isUuid, ok, type Result } from "@rentweb/core";
import { getPayment, isPaymentStateError, markFailed, markPaid, paymentRefundRequired, refundPayment } from "@rentweb/core/payments";
import { getStorage } from "@rentweb/core/storage";
import {
  cancelUnpaidTopupOrder,
  failPaidOrder,
  fulfillOrder,
  getOrderById,
  revealDeliveredCode,
  topupEventPayload,
  topupFailureText,
  type CancelTopupOrderError,
  type FailTopupOrderError,
  type TopupOrder,
} from "../services/orders";
import { getWallet } from "../services/wallet";
import type { OrderTab } from "./labels";

export interface Actor {
  userId: string;
  actorType: "user" | "superadmin";
}

export type AdminNote = { at: string; by: string; text: string };

export interface AdminOrderRow {
  id: string;
  number: string;
  gameName: string;
  packageName: string;
  gameImage: string | null;
  playerFields: Record<string, string>;
  price: number;
  costPrice: number | null;
  paymentMethod: string;
  paymentStatus: string | null;
  slipUrl: string | null;
  status: string;
  fulfillment: string;
  riskScore: number;
  riskFlags: string[];
  refundRequired: boolean;
  contact: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  placedAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
}

export interface ListOrdersFilter {
  tab?: OrderTab;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  perPage?: number;
}

function tabCondition(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case "pending_payment":
      return and(eq(topupOrders.status, "pending_payment"), or(isNull(payments.id), sql`${payments.status} <> 'pending_verification'`)!);
    case "verify":
      return and(eq(topupOrders.status, "pending_payment"), eq(payments.status, "pending_verification"));
    case "manual":
      return and(eq(topupOrders.status, "processing"), eq(topupOrders.fulfillment, "manual"));
    case "api":
      return and(inArray(topupOrders.status, ["paid", "processing"]), sql`${topupOrders.fulfillment} <> 'manual'`);
    case "fulfilled":
      return eq(topupOrders.status, "fulfilled");
    case "failed":
      return inArray(topupOrders.status, ["failed", "refunded", "cancelled"]);
    default:
      return undefined;
  }
}

function searchCondition(q: string): SQL {
  const like = `%${q}%`;
  return or(
    ilike(topupOrders.number, like),
    sql`${topupOrders.playerFields}::text ilike ${like}`,
    ilike(topupOrders.contact, like),
    ilike(customers.phone, like),
    ilike(customers.name, like),
    ilike(customers.email, like),
  )!;
}

function dayStart(d: string): Date {
  return new Date(`${d}T00:00:00+07:00`);
}
function dayEnd(d: string): Date {
  return new Date(`${d}T23:59:59.999+07:00`);
}

const refundRequiredSql = sql<boolean>`coalesce((${topupOrders.supplierResponse}->>'refundRequired')::boolean, false)`;

/** Back-office queue: joins the order's payment (for slip state) + customer, filtered by tab / search / date. */
export async function listAdminTopupOrders(tx: Tx, tenantId: string, f: ListOrdersFilter = {}): Promise<{ rows: AdminOrderRow[]; total: number; page: number; pages: number }> {
  const tab = f.tab ?? "all";
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 20));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(topupOrders.tenantId, tenantId)];
  const tc = tabCondition(tab);
  if (tc) conds.push(tc);
  const q = f.q?.trim();
  if (q) conds.push(searchCondition(q));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(topupOrders.placedAt, dayStart(f.from)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lte(topupOrders.placedAt, dayEnd(f.to)));
  const where = and(...conds);

  const base = () =>
    tx
      .select({
        o: topupOrders,
        paymentStatus: payments.status,
        slipUrl: payments.slipUrl,
        customerName: customers.name,
        customerPhone: customers.phone,
        gameImage: games.image,
        refundRequired: refundRequiredSql,
      })
      .from(topupOrders)
      .leftJoin(payments, and(eq(payments.tenantId, tenantId), eq(payments.id, topupOrders.paymentId)))
      .leftJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, topupOrders.customerId)))
      .leftJoin(games, and(eq(games.tenantId, tenantId), eq(games.id, topupOrders.gameId)));

  const [rows, [c]] = await Promise.all([
    base()
      .where(where)
      .orderBy(tab === "manual" || tab === "verify" ? sql`${topupOrders.paidAt} asc nulls last, ${topupOrders.placedAt} asc` : desc(topupOrders.placedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx
      .select({ c: count() })
      .from(topupOrders)
      .leftJoin(payments, and(eq(payments.tenantId, tenantId), eq(payments.id, topupOrders.paymentId)))
      .leftJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, topupOrders.customerId)))
      .where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map(({ o, paymentStatus, slipUrl, customerName, customerPhone, gameImage, refundRequired }) => ({
      id: o.id,
      number: o.number,
      gameName: o.gameName,
      packageName: o.packageName,
      gameImage,
      playerFields: o.playerFields ?? {},
      price: o.price,
      costPrice: o.costPrice,
      paymentMethod: o.paymentMethod,
      paymentStatus,
      slipUrl,
      status: o.status,
      fulfillment: o.fulfillment,
      riskScore: o.riskScore,
      riskFlags: o.riskFlags ?? [],
      refundRequired: !!refundRequired,
      contact: o.contact,
      customerId: o.customerId,
      customerName,
      customerPhone,
      placedAt: o.placedAt,
      paidAt: o.paidAt,
      fulfilledAt: o.fulfilledAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function topupTabCounts(tx: Tx, tenantId: string): Promise<Record<OrderTab, number>> {
  const [r] = await tx
    .select({
      all: sql<number>`count(*)::int`,
      pending_payment: sql<number>`count(*) filter (where ${topupOrders.status} = 'pending_payment' and coalesce(${payments.status}, '') <> 'pending_verification')::int`,
      verify: sql<number>`count(*) filter (where ${topupOrders.status} = 'pending_payment' and ${payments.status} = 'pending_verification')::int`,
      manual: sql<number>`count(*) filter (where ${topupOrders.status} = 'processing' and ${topupOrders.fulfillment} = 'manual')::int`,
      api: sql<number>`count(*) filter (where ${topupOrders.status} in ('paid','processing') and ${topupOrders.fulfillment} <> 'manual')::int`,
      fulfilled: sql<number>`count(*) filter (where ${topupOrders.status} = 'fulfilled')::int`,
      failed: sql<number>`count(*) filter (where ${topupOrders.status} in ('failed','refunded','cancelled'))::int`,
    })
    .from(topupOrders)
    .leftJoin(payments, and(eq(payments.tenantId, tenantId), eq(payments.id, topupOrders.paymentId)))
    .where(eq(topupOrders.tenantId, tenantId));
  return {
    all: Number(r?.all ?? 0),
    pending_payment: Number(r?.pending_payment ?? 0),
    verify: Number(r?.verify ?? 0),
    manual: Number(r?.manual ?? 0),
    api: Number(r?.api ?? 0),
    fulfilled: Number(r?.fulfilled ?? 0),
    failed: Number(r?.failed ?? 0),
  };
}

/**
 * Statuses that count as a sale (money kept, top-up done or under way). ONE definition for the module header
 * (topupKpis) and the dashboard card (apps/admin dashboard/kpis.ts) – ADMIN-10.
 */
export const TOPUP_SALE_STATUSES = ["paid", "processing", "fulfilled"] as const;
const SALE_SQL = sql.raw(TOPUP_SALE_STATUSES.map((x) => `'${x}'`).join(","));

/** KPIs for the queue header: today's paid revenue / profit + the number of paid orders (same rule as the dashboard). */
export async function topupKpis(tx: Tx, tenantId: string, since: Date): Promise<{ revenue: number; profit: number; count: number; fulfilled: number }> {
  const [r] = await tx
    .select({
      revenue: sql<number>`coalesce(sum(${topupOrders.price}) filter (where ${topupOrders.status} in (${SALE_SQL})), 0)::bigint`,
      profit: sql<number>`coalesce(sum(${topupOrders.price} - coalesce(${topupOrders.costPrice}, 0)) filter (where ${topupOrders.status} = 'fulfilled'), 0)::bigint`,
      count: sql<number>`count(*) filter (where ${topupOrders.status} in (${SALE_SQL}))::int`,
      fulfilled: sql<number>`count(*) filter (where ${topupOrders.status} = 'fulfilled')::int`,
    })
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, since)));
  return { revenue: Number(r?.revenue ?? 0), profit: Number(r?.profit ?? 0), count: Number(r?.count ?? 0), fulfilled: Number(r?.fulfilled ?? 0) };
}

export interface AdminOrderDetail {
  order: TopupOrder;
  payment: typeof payments.$inferSelect | null;
  customer: { id: string; name: string | null; phone: string | null; email: string | null; tier: string; ordersCount: number; blockedAt: Date | null } | null;
  game: { id: string; name: string; slug: string; image: string | null; fields: Array<{ key: string; label: string; type: string }> } | null;
  pkg: { id: string; name: string; estimatedMinutes: number; fulfillment: string; supplierProductCode: string | null } | null;
  supplierName: string | null;
  /** decrypted delivered code (fulfilled orders only) */
  deliveredCode: string | null;
  notes: AdminNote[];
  refundRequired: boolean;
  /** the shop recorded the manual refund (adminMarkRefunded) */
  refund: ReturnType<typeof refundRecordOf>;
  /** the payment layer flagged the money ต้องคืนเงิน (late / duplicate money, fulfilment failed) */
  paymentRefundReason: string | null;
  timeline: Array<{ at: Date; label: string; detail?: string | null; tone: "muted" | "success" | "destructive" | "soft" | "warning" }>;
  /** how many other orders this customer / contact placed */
  customerOrderCount: number;
}

export function notesOf(order: Pick<TopupOrder, "supplierResponse">): AdminNote[] {
  const raw = (order.supplierResponse as { notes?: unknown } | null)?.notes;
  return Array.isArray(raw) ? (raw.filter((n) => n && typeof n === "object" && typeof (n as AdminNote).text === "string") as AdminNote[]) : [];
}

export async function getAdminTopupOrder(tx: Tx, tenantId: string, orderId: string): Promise<AdminOrderDetail | null> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return null;
  const [payment, [customer], [game], [pkg], logs] = await Promise.all([
    order.paymentId ? getPayment(tx, tenantId, order.paymentId) : Promise.resolve(null),
    order.customerId
      ? tx
          .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, tier: customers.tier, ordersCount: customers.ordersCount, blockedAt: customers.blockedAt })
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), eq(customers.id, order.customerId)))
          .limit(1)
      : Promise.resolve([null]),
    tx.select({ id: games.id, name: games.name, slug: games.slug, image: games.image, fields: games.fields }).from(games).where(and(eq(games.tenantId, tenantId), eq(games.id, order.gameId))).limit(1),
    tx
      .select({ id: gamePackages.id, name: gamePackages.name, estimatedMinutes: gamePackages.estimatedMinutes, fulfillment: gamePackages.fulfillment, supplierProductCode: gamePackages.supplierProductCode, supplierName: topupSuppliers.name })
      .from(gamePackages)
      .leftJoin(topupSuppliers, and(eq(topupSuppliers.tenantId, tenantId), eq(topupSuppliers.id, gamePackages.supplierId)))
      .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, order.packageId)))
      .limit(1),
    tx
      .select({ action: auditLogs.action, actorType: auditLogs.actorType, actorId: auditLogs.actorId, diff: auditLogs.diff, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.targetType, "topup_order"), eq(auditLogs.targetId, order.id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(30),
  ]);
  const [cnt] = order.customerId
    ? await tx
        .select({ c: count() })
        .from(topupOrders)
        .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.customerId, order.customerId)))
    : [{ c: 0 }];

  const sr = (order.supplierResponse ?? {}) as Record<string, unknown>;
  const timeline: AdminOrderDetail["timeline"] = [{ at: order.placedAt, label: "สร้างรายการ", detail: order.ip ? `IP ${order.ip}` : null, tone: "muted" }];
  if (payment?.slipUrl && payment.status === "pending_verification") timeline.push({ at: payment.updatedAt, label: "ลูกค้าแนบสลิป", tone: "warning" });
  if (order.paidAt) timeline.push({ at: order.paidAt, label: "ชำระเงินแล้ว", detail: payment?.verifiedBy ? `ตรวจโดย ${payment.verifiedBy}` : null, tone: "success" });
  const refund = refundRecordOf(order);
  if (typeof sr.failedAt === "string") timeline.push({ at: new Date(sr.failedAt), label: order.status === "refunded" && sr.refunded === "wallet" ? "เติมไม่สำเร็จ · คืนเงินเข้ากระเป๋าแล้ว" : "เติมไม่สำเร็จ", detail: topupFailureText(order.failureReason), tone: "destructive" });
  if (refund) timeline.push({ at: new Date(refund.at), label: `บันทึกว่าคืนเงินแล้ว${refund.amount ? ` ${(refund.amount / 100).toLocaleString("th-TH")} บาท` : ""}`, detail: refund.note, tone: "success" });
  // admin cancels show through the topup.cancel audit row; system (payment expired) / customer cancels only here
  if (typeof sr.cancelledAt === "string" && (sr.cancelledBy === "system" || sr.cancelledBy === "customer")) timeline.push({ at: new Date(sr.cancelledAt), label: sr.cancelledBy === "system" ? "ระบบยกเลิกรายการ" : "ลูกค้ายกเลิกรายการ", detail: order.failureReason, tone: "muted" });
  if (order.fulfilledAt) timeline.push({ at: order.fulfilledAt, label: "เติมสำเร็จ", detail: order.processedBy && order.processedBy !== "system" ? `โดยแอดมิน` : order.supplierRef ? `อ้างอิง ${order.supplierRef}` : null, tone: "success" });
  for (const l of logs) {
    const label = AUDIT_LABEL[l.action];
    if (!label) continue;
    timeline.push({ at: l.createdAt, label, detail: typeof l.diff?.reason === "string" ? l.diff.reason : null, tone: l.action.includes("fail") || l.action.includes("reject") ? "destructive" : "soft" });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    order,
    payment,
    customer: customer ?? null,
    game: game ? { ...game, fields: (game.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type })) } : null,
    pkg: pkg ? { id: pkg.id, name: pkg.name, estimatedMinutes: pkg.estimatedMinutes, fulfillment: pkg.fulfillment, supplierProductCode: pkg.supplierProductCode } : null,
    supplierName: pkg?.supplierName ?? null,
    deliveredCode: revealDeliveredCode(order),
    notes: notesOf(order),
    refundRequired: sr.refundRequired === true,
    refund,
    // RV-05: shown on the order page; for a cancelled / failed order it is also what "บันทึกว่าคืนเงินแล้ว" settles
    paymentRefundReason: payment && (payment.status === "paid" || payment.status === "partially_refunded") ? paymentRefundRequired(payment) : null,
    timeline,
    customerOrderCount: Number(cnt?.c ?? 0),
  };
}

const AUDIT_LABEL: Record<string, string> = {
  "topup.retry": "แอดมินสั่งลองเติมใหม่",
  "topup.slip.approve": "แอดมินอนุมัติสลิป",
  "topup.slip.reject": "แอดมินปฏิเสธสลิป",
  "topup.cancel": "แอดมินยกเลิกรายการ",
  "topup.note": "เพิ่มโน้ตภายใน",
};

const CLOSED = new Set(["failed", "refunded", "cancelled"]);

/** Row-locks the order for a mutation (concurrent admin clicks / the paid handler serialise here). */
async function lockOrderRow(tx: Tx, tenantId: string, orderId: string): Promise<TopupOrder | null> {
  if (!isUuid(orderId)) return null;
  const [row] = await tx.select().from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, orderId))).for("update");
  return row ?? null;
}

function mergeResponse(order: TopupOrder, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...((order.supplierResponse ?? {}) as Record<string, unknown>), ...patch };
}

/** Proof images must be files this tenant uploaded through uploadProofAction (no arbitrary / foreign URLs). */
export function isOwnProofImage(tenantId: string, url: string): boolean {
  const prefix = getStorage().publicUrl(`tenants/${tenantId}/topup-proof/`);
  if (!url.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_-]{1,80}\.(jpg|png|webp|gif|avif)$/.test(url.slice(prefix.length));
}

/** Manual fulfilment: marks a paid/processing order fulfilled with optional proof image + delivered code. */
export async function adminFulfillOrder(tx: Tx, tenantId: string, orderId: string, input: { deliveredCode?: string | null; proofImage?: string | null; note?: string | null }, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await lockOrderRow(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.status === "fulfilled") return fail("รายการนี้เติมสำเร็จไปแล้ว", "already");
  if (order.status !== "processing" && order.status !== "paid") return fail("รายการต้องชำระเงินแล้วและอยู่ระหว่างเติม", "bad_status");
  const proof = input.proofImage?.trim() || null;
  if (proof && !isOwnProofImage(tenantId, proof)) return fail("รูปหลักฐานไม่ถูกต้อง — กรุณาอัปโหลดรูปใหม่", "proof");
  const code = input.deliveredCode?.trim() || null;
  const notes = notesOf(order);
  if (input.note?.trim()) notes.push({ at: new Date().toISOString(), by: actor.userId, text: input.note.trim() });
  const [updated] = await tx
    .update(topupOrders)
    .set({
      status: "fulfilled",
      fulfilledAt: new Date(),
      processedBy: actor.userId,
      proofImage: proof || order.proofImage,
      deliveredCodeEncrypted: code ? encryptToString(code) : order.deliveredCodeEncrypted,
      supplierResponse: mergeResponse(order, { manual: true, fulfilledBy: actor.userId, notes }),
    })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: topupEventPayload(updated!, { manual: true, proofImage: proof, hasCode: !!code }) });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.fulfill", targetType: "topup_order", targetId: order.id, diff: { number: order.number, price: order.price, proof: !!proof, code: !!code } });
  return ok(updated!);
}

/** Batch manual fulfilment (no proof / code). Skips orders that are not in a fulfillable state. */
export async function adminFulfillMany(tx: Tx, tenantId: string, ids: string[], actor: Actor): Promise<{ done: number; skipped: number }> {
  let done = 0;
  let skipped = 0;
  for (const id of [...new Set(ids)]) {
    const r = await adminFulfillOrder(tx, tenantId, id, {}, actor);
    if (r.ok) done += 1;
    else skipped += 1;
  }
  return { done, skipped };
}

/** Thai copy for the failPaidOrder refusals (ADMIN-03: an unpaid order is cancelled, never "failed"). */
export const FAIL_ORDER_ERROR: Record<FailTopupOrderError, string> = {
  not_found: "ไม่พบรายการ",
  not_paid: "รายการยังไม่ชำระเงิน — ใช้ “ยกเลิกรายการ” แทน",
  closed: "รายการนี้ปิดไปแล้ว",
};

/**
 * Fails a paid / processing order (services failPaidOrder): wallet payments are credited back automatically,
 * others become "failed" with the order AND its payment flagged for a manual refund (payment.refund_required).
 * ADMIN-03: an unpaid order is refused with not_paid – the admin cancels it instead (adminCancelOrder).
 */
export async function adminFailOrder(tx: Tx, tenantId: string, orderId: string, reason: string, actor: Actor): Promise<Result<{ order: TopupOrder; refunded: boolean; refundRequired: boolean }>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail(FAIL_ORDER_ERROR.not_found, "not_found");
  if (order.status === "fulfilled") return fail("รายการนี้เติมสำเร็จแล้ว ไม่สามารถเปลี่ยนเป็นไม่สำเร็จได้", "bad_status");
  if (order.status === "pending_payment") return fail(FAIL_ORDER_ERROR.not_paid, "not_paid");
  if (order.paymentMethod === "wallet" && order.customerId && !CLOSED.has(order.status)) {
    const w = await getWallet(tx, tenantId, order.customerId);
    if (w?.frozen) return fail("กระเป๋าเงินของลูกค้าถูกระงับอยู่ — ปลดระงับก่อน ระบบจึงจะคืนเงินอัตโนมัติได้", "frozen");
  }
  const r = await failPaidOrder(tx, tenantId, order.id, reason, { by: actor.userId });
  if (!r.ok) return fail(FAIL_ORDER_ERROR[r.error], r.error);
  const { order: failed, refunded, refundRequired: needsRefund } = r.value;
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.fail", targetType: "topup_order", targetId: order.id, diff: { number: order.number, reason, refunded, refundRequired: needsRefund, price: order.price } });
  return ok({ order: failed, refunded, refundRequired: needsRefund });
}

/** supplier_response.refundedAt – the shop recorded that the money went back (adminMarkRefunded). */
export function refundRecordOf(order: Pick<TopupOrder, "supplierResponse">): { at: string; by: string | null; note: string | null; amount: number | null } | null {
  const sr = (order.supplierResponse ?? {}) as Record<string, unknown>;
  if (typeof sr.refundedAt !== "string") return null;
  return { at: sr.refundedAt, by: typeof sr.refundedBy === "string" ? sr.refundedBy : null, note: typeof sr.refundNote === "string" ? sr.refundNote : null, amount: typeof sr.refundedAmount === "number" ? sr.refundedAmount : null };
}

/**
 * Re-runs the automatic fulfilment (api / stock) for a paid order that failed or is stuck in processing.
 * ADMIN-12: an order whose money already went back (refunded, or refundedAt recorded) is never re-fulfilled; an
 * order still flagged for a manual refund needs `ackRefundPending` (the admin confirms the money has NOT gone back).
 */
export async function adminRetryOrder(tx: Tx, tenantId: string, orderId: string, actor: Actor, opts: { ackRefundPending?: boolean } = {}): Promise<Result<TopupOrder>> {
  const order = await lockOrderRow(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.fulfillment === "manual") return fail("แพ็กเกจเติมมือ ใช้ปุ่ม “เติมสำเร็จ” แทน", "manual");
  if (!order.paidAt) return fail("รายการยังไม่ได้ชำระเงิน", "unpaid");
  if (order.status === "refunded" || refundRecordOf(order)) return fail("รายการนี้คืนเงินลูกค้าแล้ว ลองเติมใหม่ไม่ได้", "refunded");
  if (!["failed", "processing", "paid"].includes(order.status)) return fail("สถานะปัจจุบันลองใหม่ไม่ได้", "bad_status");
  const sr = (order.supplierResponse ?? {}) as Record<string, unknown>;
  if (sr.refundRequired === true && !opts.ackRefundPending) return fail("รายการนี้ติดธงต้องคืนเงิน — ยืนยันก่อนว่ายังไม่ได้โอนเงินคืนลูกค้า แล้วจึงลองใหม่", "refund_pending");
  await tx
    .update(topupOrders)
    .set({ status: "paid", failureReason: null, supplierResponse: mergeResponse(order, { retriedAt: new Date().toISOString(), retriedBy: actor.userId }) })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)));
  let result = await fulfillOrder(tx, tenantId, order.id);
  // the fulfilment strategies replace supplier_response wholesale – carry the internal notes + retry trail over
  const notes = notesOf(order);
  if (result && notes.length) {
    const [kept] = await tx
      .update(topupOrders)
      .set({ supplierResponse: { ...((result.supplierResponse ?? {}) as Record<string, unknown>), notes, retriedAt: new Date().toISOString(), retriedBy: actor.userId } })
      .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
      .returning();
    result = kept ?? result;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.retry", targetType: "topup_order", targetId: order.id, diff: { number: order.number, result: result?.status ?? null, refundPending: sr.refundRequired === true } });
  if (!result) return fail("ไม่พบรายการ", "not_found");
  if (result.status === "processing") return fail("ยังไม่ทราบผลจากผู้ให้บริการ — กดลองใหม่อีกครั้งภายหลัง ระบบจะตรวจสอบกับผู้ให้บริการก่อนส่งซ้ำ", "retry_unknown");
  if (result.status !== "fulfilled") return fail(`ลองใหม่แล้วแต่ยังไม่สำเร็จ (${topupFailureText(result.failureReason ?? result.status)})`, "retry_failed");
  return ok(result);
}

/**
 * SERVICES-15 / ADMIN-12: the shop returned the money of a failed order by hand (bank transfer …). Records it
 * through the payment layer – refundPayment() (payment refunded + payment.refunded) – then the order becomes
 * "refunded" with supplier_response.refundedAt / refundedBy / refundNote (refundRequired cleared), audit
 * topup.refund and event topup.refunded. adminRetryOrder refuses the order afterwards.
 */
export async function adminMarkRefunded(tx: Tx, tenantId: string, orderId: string, input: { note?: string | null }, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await lockOrderRow(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.status === "refunded" || refundRecordOf(order)) return fail("บันทึกการคืนเงินของรายการนี้ไปแล้ว", "already");
  const sr = (order.supplierResponse ?? {}) as Record<string, unknown>;
  const current = order.paymentId ? await getPayment(tx, tenantId, order.paymentId) : null;
  // RV-05: money that arrived after the order was closed (late slip of a cancelled order …) is flagged on the PAYMENT only
  const lateMoney = !!current && (current.status === "paid" || current.status === "partially_refunded") && !!paymentRefundRequired(current) && (order.status === "cancelled" || order.status === "failed");
  if (!((order.status === "failed" && sr.refundRequired === true) || lateMoney)) return fail("บันทึกคืนเงินได้เฉพาะรายการที่เติมไม่สำเร็จและติดธงต้องคืนเงิน", "bad_status");
  const note = input.note?.trim().slice(0, 300) || null;
  let refundedAmount = order.price;
  if (order.paymentId) {
    const p = current;
    if (p && (p.status === "paid" || p.status === "partially_refunded")) {
      try {
        const after = await refundPayment(tx, tenantId, p.id, undefined, note ? `คืนเงินแล้ว: ${note}` : `คืนเงินแล้ว (${order.number})`);
        refundedAmount = after.refundedAmount - p.refundedAmount || order.price;
      } catch (err) {
        if (!isPaymentStateError(err)) throw err; // refunded concurrently – the order update below still applies
      }
    } else if (p && p.status !== "refunded") {
      return fail("การชำระเงินของรายการนี้ไม่อยู่ในสถานะชำระแล้ว — ตรวจสอบที่หน้าการชำระเงิน", "bad_payment");
    }
  }
  const [updated] = await tx
    .update(topupOrders)
    .set({
      status: "refunded",
      processedBy: actor.userId,
      supplierResponse: { ...sr, refundRequired: false, refunded: "manual", refundedAt: new Date().toISOString(), refundedBy: actor.userId, refundNote: note, refundedAmount, ...(lateMoney && order.status === "cancelled" ? { refundOf: "late_payment" } : {}) },
    })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.refund", targetType: "topup_order", targetId: order.id, diff: { number: order.number, amount: refundedAmount, paymentId: order.paymentId, note } });
  await emitEvent(tx, { tenantId, type: "topup.refunded", payload: topupEventPayload(updated!, { manual: true, refundedAmount, note, reasonText: topupFailureText(order.failureReason) }) });
  return ok(updated!);
}

/** Thai copy for the cancelUnpaidTopupOrder refusals. */
export const CANCEL_ORDER_ERROR: Record<CancelTopupOrderError, string> = {
  not_found: "ไม่พบรายการ",
  not_pending: "ยกเลิกได้เฉพาะรายการที่ยังไม่ชำระเงิน",
  slip_pending: "มีสลิปรอตรวจอยู่ — ตรวจสลิปก่อน หรือยืนยันยกเลิกทั้งที่มีสลิปรอตรวจ",
  paid: "ลูกค้าชำระเงินเข้ามาแล้วระหว่างนี้ — โหลดหน้าใหม่เพื่อดูสถานะล่าสุด",
};

/**
 * Cancels an unpaid order (ADMIN-04 / SERVICES-14): services cancelUnpaidTopupOrder voids the open payment through
 * the payment layer (cancelPayment → payment cancelled + payment.cancelled; an expired payment stays expired) and
 * emits topup.cancelled itself. A slip under review needs `allowSlipPending`.
 */
export async function adminCancelOrder(tx: Tx, tenantId: string, orderId: string, reason: string | null, actor: Actor, opts: { allowSlipPending?: boolean } = {}): Promise<Result<TopupOrder>> {
  const r = await cancelUnpaidTopupOrder(tx, tenantId, orderId, { reason, by: "admin", actorId: actor.userId, allowSlipPending: opts.allowSlipPending === true });
  if (!r.ok) return fail(CANCEL_ORDER_ERROR[r.error], r.error);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.cancel", targetType: "topup_order", targetId: r.value.id, diff: { number: r.value.number, reason: r.value.failureReason, paymentId: r.value.paymentId } });
  return ok(r.value);
}

/**
 * Approves the uploaded slip: markPaid → onTopupPaid → fulfilment (api/stock now, manual → queue).
 * RV-04: `refundRequired` is the reason markPaid flagged the money (order cancelled / closed before the money was
 * confirmed, stock gone, paid twice …) – the money was recorded but must go back to the customer; the UI must say so.
 */
export async function adminApproveSlip(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<{ order: TopupOrder; refundRequired: string | null }>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (!order.paymentId) return fail("รายการนี้ไม่มีข้อมูลการชำระเงิน", "no_payment");
  const payment = await getPayment(tx, tenantId, order.paymentId);
  if (!payment) return fail("ไม่พบรายการชำระเงิน", "no_payment");
  if (payment.status === "paid") return fail("ชำระเงินแล้ว", "already");
  if (!["pending", "pending_verification", "failed", "expired"].includes(payment.status)) return fail("รายการชำระเงินนี้ปิดแล้ว — อนุมัติไม่ได้", "bad_status");
  let refundRequired: string | null = null;
  try {
    const paid = await markPaid(tx, tenantId, payment.id, { verifiedBy: actor.userId });
    refundRequired = paymentRefundRequired(paid);
  } catch (err) {
    if (isPaymentStateError(err)) return fail("สถานะการชำระเงินเปลี่ยนไประหว่างนี้ — โหลดหน้าใหม่", "bad_status");
    throw err;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.slip.approve", targetType: "topup_order", targetId: order.id, diff: { number: order.number, paymentId: payment.id, amount: payment.amount, refundRequired } });
  const fresh = await getOrderById(tx, tenantId, order.id);
  return ok({ order: fresh ?? order, refundRequired });
}

/**
 * Rejects the slip of an unpaid order (payment → failed; the customer may upload a new one). ADMIN-05: a payment
 * that is already closed (paid / refunded / cancelled) or an order no longer waiting for money gets a friendly
 * refusal instead of an unhandled PaymentStateError.
 */
export async function adminRejectSlip(tx: Tx, tenantId: string, orderId: string, reason: string, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (!order.paymentId) return fail("รายการนี้ไม่มีข้อมูลการชำระเงิน", "no_payment");
  const payment = await getPayment(tx, tenantId, order.paymentId);
  if (!payment) return fail("ไม่พบรายการชำระเงิน", "no_payment");
  if (payment.status === "paid" || payment.status === "partially_refunded") return fail("ชำระเงินแล้ว ปฏิเสธไม่ได้", "already");
  if (payment.status === "failed") return fail("ปฏิเสธสลิปนี้ไปแล้ว", "already");
  if (order.status !== "pending_payment" || !["pending", "pending_verification", "expired"].includes(payment.status)) return fail("รายการชำระเงินนี้ปิดแล้ว", "bad_status");
  try {
    await markFailed(tx, tenantId, payment.id, reason);
  } catch (err) {
    if (isPaymentStateError(err)) return fail("รายการชำระเงินนี้ปิดแล้ว", "bad_status");
    throw err;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.slip.reject", targetType: "topup_order", targetId: order.id, diff: { number: order.number, paymentId: payment.id, reason } });
  return ok(order);
}

/** Appends an internal note (stored in supplier_response.notes – no schema change needed). */
export async function addOrderNote(tx: Tx, tenantId: string, orderId: string, text: string, actor: Actor): Promise<Result<AdminNote[]>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  const notes = notesOf(order);
  notes.push({ at: new Date().toISOString(), by: actor.userId, text: text.trim().slice(0, 1000) });
  await tx
    .update(topupOrders)
    .set({ supplierResponse: mergeResponse(order, { notes }) })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)));
  return ok(notes);
}
