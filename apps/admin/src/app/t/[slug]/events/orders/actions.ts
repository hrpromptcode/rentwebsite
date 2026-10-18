"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { approveTicketOrderPayment, cancelUnpaidOrder, recordCashTicketPayment, refundTicketOrder, rejectTicketOrderPayment, resendTickets, setOrderInternalNote, updateTicketHolder, voidTicket } from "@rentweb/module-events/admin";
import { fieldErrors, holderSchema, noteSchema, reasonSchema, refundSchema, type FormResult, type HolderInput, type RefundInput } from "@rentweb/module-events/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { thb } from "@/lib/format";
import { actorOf, eventsModuleConfig } from "../_lib";

function revalidate(slug: string, orderId?: string | null) {
  revalidatePath(`/t/${slug}/events`);
  revalidatePath(`/t/${slug}/events/orders`);
  revalidatePath(`/t/${slug}/events/attendees`);
  revalidatePath(`/t/${slug}/events/checkin`);
  revalidatePath(`/t/${slug}/payments`);
  revalidatePath(`/t/${slug}/dashboard`);
  if (orderId) revalidatePath(`/t/${slug}/events/orders/${orderId}`);
}

const ERR: Record<string, string> = {
  not_found: "ไม่พบคำสั่งซื้อ",
  not_pending: "คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน",
  not_paid: "คำสั่งซื้อนี้ยังไม่ได้ชำระเงิน",
  nothing_to_refund: "ไม่มีบัตรที่คืนเงินได้แล้ว",
  ticket_not_found: "ไม่พบบัตรที่เลือกในคำสั่งซื้อนี้",
};

export async function approvePaymentAction(slug: string, orderId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => approveTicketOrderPayment(tx, ctx.tenant.id, orderId, paymentId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, orderId);
  return { ok: true, message: "ยืนยันการชำระเงินแล้ว — ออกบัตรและส่ง QR ให้ลูกค้าแล้ว" };
}

export async function rejectPaymentAction(slug: string, orderId: string, paymentId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล" };
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectTicketOrderPayment(tx, ctx.tenant.id, orderId, paymentId, parsed.data.reason, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, orderId);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว — ลูกค้าส่งสลิปใหม่หรือขอ QR ใหม่ได้จนกว่าจะหมดเวลาถือบัตร" };
}

export async function cashPaymentAction(slug: string, orderId: string): Promise<FormResult<{ amount: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => recordCashTicketPayment(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, orderId);
  return { ok: true, message: `บันทึกรับเงินสด ${thb(r.value.amount)} แล้ว — ออกบัตรแล้ว`, data: r.value };
}

export async function refundOrderAction(slug: string, orderId: string, input: RefundInput): Promise<FormResult<{ refundedAmount: number; full: boolean; tickets: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const config = await eventsModuleConfig(ctx);
  const actor = actorOf(ctx);
  const r = await tenantTx(ctx.tenant.id, (tx) => refundTicketOrder(tx, ctx.tenant.id, orderId, { ticketIds: parsed.data.ticketIds ?? null, amount: parsed.data.amount ?? null, reason: parsed.data.reason ?? null, actorId: actor.userId, actorType: actor.actorType, config }));
  if (!r.ok) return { ok: false, error: ERR[r.error] ?? r.error };
  revalidate(slug, orderId);
  const n = r.value.tickets.length;
  return { ok: true, message: r.value.full ? `คืนเงินเต็มจำนวน ${thb(r.value.refundedAmount)} แล้ว — บัตรทั้ง ${n} ใบใช้ไม่ได้แล้ว` : `คืนเงิน ${thb(r.value.refundedAmount)} สำหรับบัตร ${n} ใบแล้ว — บัตรที่เหลือยังใช้ได้`, data: { refundedAmount: r.value.refundedAmount, full: r.value.full, tickets: n } };
}

export async function cancelOrderAction(slug: string, orderId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล" };
  const r = await tenantTx(ctx.tenant.id, (tx) => cancelUnpaidOrder(tx, ctx.tenant.id, orderId, { by: "admin", reason: parsed.data.reason, actorId: ctx.userId }));
  if (!r.ok) return { ok: false, error: ERR[r.error] ?? r.error };
  revalidate(slug, orderId);
  return { ok: true, message: "ยกเลิกคำสั่งซื้อแล้ว — บัตรที่ถือไว้ถูกปล่อยคืน" };
}

export async function saveOrderNoteAction(slug: string, orderId: string, internalNote: string | null): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  const parsed = noteSchema.safeParse({ internalNote });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  await tenantTx(ctx.tenant.id, (tx) => setOrderInternalNote(tx, ctx.tenant.id, orderId, parsed.data.internalNote ?? null));
  revalidate(slug, orderId);
  return { ok: true, message: "บันทึกโน้ตแล้ว" };
}

export async function resendTicketsAction(slug: string, orderId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => resendTickets(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: `ส่งบัตร ${r.value.tickets} ใบอีกครั้งไปที่ ${r.value.to.join(" / ")} แล้ว (ระบบแจ้งเตือนจัดส่งให้ภายในไม่กี่นาที)` };
}

export async function voidTicketAction(slug: string, orderId: string, ticketId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(ticketId)) return { ok: false, error: "ไม่พบบัตร" };
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล" };
  const r = await tenantTx(ctx.tenant.id, (tx) => voidTicket(tx, ctx.tenant.id, ticketId, parsed.data.reason, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, orderId);
  return { ok: true, message: `ยกเลิกบัตร ${r.value.code} แล้ว — QR ใบนี้จะถูกปฏิเสธที่จุดเช็กอิน (ไม่มีการคืนเงิน)` };
}

export async function updateHolderAction(slug: string, orderId: string, ticketId: string, input: HolderInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(ticketId)) return { ok: false, error: "ไม่พบบัตร" };
  const parsed = holderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const row = await tenantTx(ctx.tenant.id, (tx) => updateTicketHolder(tx, ctx.tenant.id, ticketId, parsed.data));
  if (!row) return { ok: false, error: "ไม่พบบัตร" };
  revalidate(slug, orderId);
  return { ok: true, message: "บันทึกชื่อผู้ถือบัตรแล้ว" };
}
