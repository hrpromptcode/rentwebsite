"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import {
  adminCreateOrder,
  cancelOrderAdmin,
  completeOrder,
  confirmOrder,
  refundOrderPayment,
  rejectPayment,
  shipOrder,
  updateInternalNote,
  verifyPayment,
  type Actor,
} from "@rentweb/module-commerce/admin";
import { bahtToSatang, fieldErrors, manualOrderSchema, shipOrderSchema, type FormResult, type ManualOrderInput, type ShipOrderInput } from "@rentweb/module-commerce/admin/schemas";
import { paymentRefundRequired } from "@rentweb/core/payments";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidateOrder(slug: string, orderId?: string) {
  revalidatePath(`/t/${slug}/orders`);
  if (orderId) revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/payments`);
  revalidatePath(`/t/${slug}/dashboard`);
}

export async function confirmOrderAction(slug: string, orderId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบออเดอร์" };
  const r = await tenantTx(ctx.tenant.id, (tx) => confirmOrder(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  return { ok: true, message: "ยืนยันออเดอร์แล้ว" };
}

export async function shipOrderAction(slug: string, orderId: string, input: ShipOrderInput): Promise<FormResult<{ trackingUrl: string | null }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบออเดอร์" };
  const parsed = shipOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => shipOrder(tx, ctx.tenant.id, orderId, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  return { ok: true, message: "บันทึกการจัดส่งแล้ว ลูกค้าจะได้รับแจ้งเตือน", data: { trackingUrl: r.value.trackingUrl } };
}

export async function completeOrderAction(slug: string, orderId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบออเดอร์" };
  const r = await tenantTx(ctx.tenant.id, (tx) => completeOrder(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  return { ok: true, message: "ปิดออเดอร์เป็นสำเร็จแล้ว" };
}

export async function cancelOrderAction(slug: string, orderId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบออเดอร์" };
  const r = await tenantTx(ctx.tenant.id, (tx) => cancelOrderAdmin(tx, ctx.tenant.id, orderId, reason.trim().slice(0, 300) || null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  return { ok: true, message: r.value.restocked > 0 ? `ยกเลิกออเดอร์แล้ว คืนสต็อก ${r.value.restocked} ชิ้น` : "ยกเลิกออเดอร์แล้ว" };
}

export async function refundOrderAction(slug: string, orderId: string, input: { paymentId: string; amount: string; note?: string | null }): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId) || !isUuid(input.paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const amount = bahtToSatang(input.amount);
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { ok: false, error: "กรุณากรอกจำนวนเงินคืนให้ถูกต้อง", fieldErrors: { amount: "กรุณากรอกจำนวนเงินคืนให้ถูกต้อง" } };
  const r = await tenantTx(ctx.tenant.id, (tx) => refundOrderPayment(tx, ctx.tenant.id, orderId, input.paymentId, amount, input.note?.trim().slice(0, 300) || null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.code === "amount" ? { amount: r.error } : undefined };
  revalidateOrder(slug, orderId);
  revalidatePath(`/t/${slug}/products`);
  if (r.value.paymentStatus !== "refunded") return { ok: true, message: "บันทึกการคืนเงินบางส่วนแล้ว" };
  return { ok: true, message: r.value.restocked > 0 ? `คืนเงินเต็มจำนวนแล้ว คืนสต็อก ${r.value.restocked} ชิ้น` : "คืนเงินเต็มจำนวนแล้ว" };
}

export async function verifyPaymentAction(slug: string, orderId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการชำระเงิน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => verifyPayment(tx, ctx.tenant.id, paymentId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  const refund = paymentRefundRequired(r.value);
  return { ok: true, message: refund ? `บันทึกว่าได้รับเงินแล้ว แต่ต้องคืนเงินลูกค้า: ${refund}` : "ยืนยันการชำระเงินแล้ว" };
}

export async function rejectPaymentAction(slug: string, orderId: string, paymentId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการชำระเงิน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectPayment(tx, ctx.tenant.id, paymentId, reason.trim().slice(0, 300) || "สลิปไม่ถูกต้อง", actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, orderId);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว ลูกค้าสามารถแนบสลิปใหม่ได้" };
}

export async function saveInternalNoteAction(slug: string, orderId: string, note: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบออเดอร์" };
  const okk = await tenantTx(ctx.tenant.id, (tx) => updateInternalNote(tx, ctx.tenant.id, orderId, note.slice(0, 5000)));
  if (!okk) return { ok: false, error: "ไม่พบออเดอร์" };
  revalidatePath(`/t/${slug}/orders/${orderId}`);
  return { ok: true, message: "บันทึกโน้ตภายในแล้ว" };
}

export async function createManualOrderAction(slug: string, input: ManualOrderInput): Promise<FormResult<{ orderId: string; number: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminCreateOrder(tx, ctx.tenant.id, parsed.data, (ctx.tenant.settings ?? {}) as Record<string, unknown>, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateOrder(slug, r.value.orderId);
  revalidatePath(`/t/${slug}/products`);
  return { ok: true, message: `สร้างออเดอร์ ${r.value.number} แล้ว`, data: { orderId: r.value.orderId, number: r.value.number } };
}
