"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { advanceOrder, approveOrderPayment, cancelOrder, rejectOrderPayment, settleSession, type SettleMode } from "@rentweb/module-restaurant/admin";
import { ORDER_STATUSES } from "@rentweb/module-restaurant/services";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

const uuid = z.string().uuid();

function revalidate(slug: string) {
  for (const p of ["orders", "kitchen", "tables"]) revalidatePath(`/t/${slug}/restaurant/${p}`);
}

export async function advanceOrderAction(slug: string, orderId: string, next: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = z.object({ orderId: uuid, next: z.enum(ORDER_STATUSES) }).safeParse({ orderId, next });
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  if (parsed.data.next === "cancelled") return cancelOrderAction(slug, orderId);
  const r = await tenantTx(ctx.tenant.id, (tx) => advanceOrder(tx, ctx.tenant.id, parsed.data.orderId, parsed.data.next));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  const label: Record<string, string> = { preparing: "เริ่มทำแล้ว", ready: r.value.type === "pickup" ? "พร้อมรับแล้ว แจ้งลูกค้าแล้ว" : "พร้อมเสิร์ฟแล้ว", served: "เสิร์ฟแล้ว", completed: "ปิดออเดอร์แล้ว" };
  return { ok: true, message: `${r.value.number}: ${label[parsed.data.next] ?? "อัปเดตแล้ว"}` };
}

export async function cancelOrderAction(slug: string, orderId: string, reason?: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, async (tx) => {
    const res = await cancelOrder(tx, ctx.tenant.id, orderId, reason ?? null);
    if (res.ok && res.value.paymentStatus === "paid" && !hasRole(ctx, "manager")) throw new Error("ออเดอร์ที่ชำระแล้วต้องให้ผู้จัดการเป็นผู้ยกเลิก");
    return res;
  });
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "rest_order.cancel", targetType: "rest_order", targetId: orderId, diff: { number: r.value.number, total: r.value.total, paymentStatus: r.value.paymentStatus, reason: reason ?? null } });
  revalidate(slug);
  return { ok: true, message: `ยกเลิก ${r.value.number} แล้ว${r.value.paymentStatus === "paid" ? " (ชำระแล้ว – โปรดคืนเงินลูกค้า)" : ""}` };
}

/** mode "approve" = approve the pending PromptPay/slip payment; "cash" = record a cash payment. */
export async function approvePaymentAction(slug: string, orderId: string, mode: "approve" | "cash"): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => approveOrderPayment(tx, ctx.tenant.id, orderId, { verifiedBy: ctx.userId, cash: mode === "cash" }));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: mode === "cash" ? "rest_order.cash_paid" : "rest_order.slip_approved", targetType: "payment", targetId: r.value.paymentId, diff: { orderId, amount: r.value.amount } });
  revalidate(slug);
  return { ok: true, message: mode === "cash" ? "บันทึกรับเงินสดแล้ว" : "อนุมัติการชำระเงินแล้ว" };
}

export async function rejectPaymentAction(slug: string, orderId: string, reason?: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const why = (reason ?? "").trim() || "สลิปไม่ถูกต้อง";
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectOrderPayment(tx, ctx.tenant.id, orderId, why));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "rest_order.slip_rejected", targetType: "payment", targetId: r.value.paymentId, diff: { orderId, reason: why } });
  revalidate(slug);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว ลูกค้าจะเห็นสถานะไม่ผ่าน" };
}

export async function settleSessionAction(slug: string, sessionId: string, mode: SettleMode): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = z.object({ sessionId: uuid, mode: z.enum(["cash", "approve", "close_only"]) }).safeParse({ sessionId, mode });
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => settleSession(tx, ctx.tenant.id, parsed.data.sessionId, { mode: parsed.data.mode, verifiedBy: ctx.userId }));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: `table.close.${parsed.data.mode}`, targetType: "table_session", targetId: sessionId, diff: { amount: r.value.amount, paymentId: r.value.paymentId } });
  revalidate(slug);
  return { ok: true, message: r.value.amount > 0 ? `รับชำระ ฿${(r.value.amount / 100).toLocaleString("th-TH")} และปิดโต๊ะแล้ว` : "ปิดโต๊ะแล้ว" };
}
