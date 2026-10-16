import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { auditLogs, customers, gamePackages, games, payments, topupOrders, topupSuppliers, type Tx } from "@rentweb/db";
import { audit, emitEvent, encryptToString, fail, ok, type Result } from "@rentweb/core";
import { getPayment, markFailed, markPaid } from "@rentweb/core/payments";
import { failOrder, fulfillOrder, getOrderById, revealDeliveredCode, type TopupOrder } from "../services/orders";
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
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(sql`${topupOrders.placedAt} >= ${dayStart(f.from)}`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(sql`${topupOrders.placedAt} <= ${dayEnd(f.to)}`);
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

/** KPIs for the queue header: today's paid revenue / profit + queue sizes. */
export async function topupKpis(tx: Tx, tenantId: string, since: Date): Promise<{ revenue: number; profit: number; count: number; fulfilled: number }> {
  const [r] = await tx
    .select({
      revenue: sql<number>`coalesce(sum(${topupOrders.price}) filter (where ${topupOrders.status} in ('paid','processing','fulfilled')), 0)::bigint`,
      profit: sql<number>`coalesce(sum(${topupOrders.price} - coalesce(${topupOrders.costPrice}, 0)) filter (where ${topupOrders.status} = 'fulfilled'), 0)::bigint`,
      count: sql<number>`count(*) filter (where ${topupOrders.status} <> 'pending_payment')::int`,
      fulfilled: sql<number>`count(*) filter (where ${topupOrders.status} = 'fulfilled')::int`,
    })
    .from(topupOrders)
    .where(and(eq(topupOrders.tenantId, tenantId), sql`${topupOrders.placedAt} >= ${since}`));
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
  if (typeof sr.failedAt === "string") timeline.push({ at: new Date(sr.failedAt), label: order.status === "refunded" ? "เติมไม่สำเร็จ · คืนเงินเข้ากระเป๋าแล้ว" : "เติมไม่สำเร็จ", detail: order.failureReason, tone: "destructive" });
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

function mergeResponse(order: TopupOrder, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...((order.supplierResponse ?? {}) as Record<string, unknown>), ...patch };
}

/** Manual fulfilment: marks a paid/processing order fulfilled with optional proof image + delivered code. */
export async function adminFulfillOrder(tx: Tx, tenantId: string, orderId: string, input: { deliveredCode?: string | null; proofImage?: string | null; note?: string | null }, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.status === "fulfilled") return fail("รายการนี้เติมสำเร็จไปแล้ว", "already");
  if (order.status !== "processing" && order.status !== "paid") return fail("รายการต้องชำระเงินแล้วและอยู่ระหว่างเติม", "bad_status");
  const code = input.deliveredCode?.trim() || null;
  const notes = notesOf(order);
  if (input.note?.trim()) notes.push({ at: new Date().toISOString(), by: actor.userId, text: input.note.trim() });
  const [updated] = await tx
    .update(topupOrders)
    .set({
      status: "fulfilled",
      fulfilledAt: new Date(),
      processedBy: actor.userId,
      proofImage: input.proofImage?.trim() || order.proofImage,
      deliveredCodeEncrypted: code ? encryptToString(code) : order.deliveredCodeEncrypted,
      supplierResponse: mergeResponse(order, { manual: true, fulfilledBy: actor.userId, notes }),
    })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  await emitEvent(tx, { tenantId, type: "topup.fulfilled", payload: { orderId: order.id, number: order.number, customerId: order.customerId, fulfillment: order.fulfillment, manual: true, proofImage: input.proofImage ?? null, hasCode: !!code } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.fulfill", targetType: "topup_order", targetId: order.id, diff: { number: order.number, price: order.price, proof: !!input.proofImage, code: !!code } });
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

/** Fails a paid/processing order; wallet payments refund automatically (service), others are flagged for a manual refund. */
export async function adminFailOrder(tx: Tx, tenantId: string, orderId: string, reason: string, actor: Actor): Promise<Result<{ order: TopupOrder; refunded: boolean; refundRequired: boolean }>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.status === "fulfilled") return fail("รายการนี้เติมสำเร็จแล้ว ไม่สามารถเปลี่ยนเป็นไม่สำเร็จได้", "bad_status");
  if (["failed", "refunded", "cancelled"].includes(order.status)) return fail("รายการนี้ปิดไปแล้ว", "already");
  const failed = await failOrder(tx, tenantId, order.id, reason);
  if (!failed) return fail("ไม่พบรายการ", "not_found");
  const [updated] = await tx
    .update(topupOrders)
    .set({ processedBy: actor.userId })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  const sr = (failed.supplierResponse ?? {}) as Record<string, unknown>;
  const refunded = failed.status === "refunded";
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.fail", targetType: "topup_order", targetId: order.id, diff: { number: order.number, reason, refunded, refundRequired: sr.refundRequired === true, price: order.price } });
  return ok({ order: updated ?? failed, refunded, refundRequired: sr.refundRequired === true });
}

/** Re-runs the automatic fulfilment (api / stock) for a paid order that failed or is stuck in processing. */
export async function adminRetryOrder(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.fulfillment === "manual") return fail("แพ็กเกจเติมมือ ใช้ปุ่ม “เติมสำเร็จ” แทน", "manual");
  if (!order.paidAt) return fail("รายการยังไม่ได้ชำระเงิน", "unpaid");
  if (!["failed", "processing", "paid"].includes(order.status)) return fail("สถานะปัจจุบันลองใหม่ไม่ได้", "bad_status");
  await tx
    .update(topupOrders)
    .set({ status: "paid", failureReason: null, supplierResponse: mergeResponse(order, { retriedAt: new Date().toISOString(), retriedBy: actor.userId }) })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)));
  const result = await fulfillOrder(tx, tenantId, order.id);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.retry", targetType: "topup_order", targetId: order.id, diff: { number: order.number, result: result?.status ?? null } });
  if (!result) return fail("ไม่พบรายการ", "not_found");
  if (result.status !== "fulfilled") return fail(`ลองใหม่แล้วแต่ยังไม่สำเร็จ (${result.failureReason ?? result.status})`, "retry_failed");
  return ok(result);
}

/** Cancels an unpaid order (customer never paid). */
export async function adminCancelOrder(tx: Tx, tenantId: string, orderId: string, reason: string | null, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (order.status !== "pending_payment") return fail("ยกเลิกได้เฉพาะรายการที่ยังไม่ชำระเงิน", "bad_status");
  const [updated] = await tx
    .update(topupOrders)
    .set({ status: "cancelled", failureReason: reason, processedBy: actor.userId })
    .where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, order.id)))
    .returning();
  if (order.paymentId) {
    await tx
      .update(payments)
      .set({ status: "cancelled", failureReason: reason ?? "ยกเลิกโดยแอดมิน" })
      .where(and(eq(payments.tenantId, tenantId), eq(payments.id, order.paymentId), inArray(payments.status, ["pending", "pending_verification", "failed", "expired"])));
  }
  await emitEvent(tx, { tenantId, type: "topup.cancelled", payload: { orderId: order.id, number: order.number, customerId: order.customerId, reason } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.cancel", targetType: "topup_order", targetId: order.id, diff: { number: order.number, reason } });
  return ok(updated!);
}

/** Approves the uploaded slip: markPaid → onTopupPaid → fulfilment (api/stock now, manual → queue). */
export async function adminApproveSlip(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (!order.paymentId) return fail("รายการนี้ไม่มีข้อมูลการชำระเงิน", "no_payment");
  const payment = await getPayment(tx, tenantId, order.paymentId);
  if (!payment) return fail("ไม่พบรายการชำระเงิน", "no_payment");
  if (payment.status === "paid") return fail("ชำระเงินแล้ว", "already");
  if (!["pending", "pending_verification", "failed", "expired"].includes(payment.status)) return fail("สถานะการชำระเงินไม่รองรับ", "bad_status");
  await markPaid(tx, tenantId, payment.id, { verifiedBy: actor.userId });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.slip.approve", targetType: "topup_order", targetId: order.id, diff: { number: order.number, paymentId: payment.id, amount: payment.amount } });
  const fresh = await getOrderById(tx, tenantId, order.id);
  return ok(fresh ?? order);
}

export async function adminRejectSlip(tx: Tx, tenantId: string, orderId: string, reason: string, actor: Actor): Promise<Result<TopupOrder>> {
  const order = await getOrderById(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบรายการ", "not_found");
  if (!order.paymentId) return fail("รายการนี้ไม่มีข้อมูลการชำระเงิน", "no_payment");
  const payment = await getPayment(tx, tenantId, order.paymentId);
  if (!payment) return fail("ไม่พบรายการชำระเงิน", "no_payment");
  if (payment.status === "paid") return fail("ชำระเงินแล้ว ปฏิเสธไม่ได้", "already");
  await markFailed(tx, tenantId, payment.id, reason);
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
