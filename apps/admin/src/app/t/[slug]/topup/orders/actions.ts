"use server";

import { z } from "zod";
import { isUuid } from "@rentweb/core";
import { addOrderNote, adminApproveSlip, adminCancelOrder, adminFailOrder, adminFulfillMany, adminFulfillOrder, adminRejectSlip, adminRetryOrder } from "@rentweb/module-topup/admin";
import { failSchema, fieldErrors, fulfillSchema, type FormResult, type FulfillInput } from "@rentweb/module-topup/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf, revalidateTopup, storeImage } from "../_shared";

function paths(orderId: string) {
  return [`/topup/orders/${orderId}`, `/topup/wallets`];
}

export async function fulfillOrderAction(slug: string, orderId: string, input: FulfillInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const parsed = fulfillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminFulfillOrder(tx, ctx.tenant.id, orderId, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  return { ok: true, message: `บันทึก ${r.value.number} เป็นเติมสำเร็จแล้ว ลูกค้าจะได้รับแจ้งเตือน` };
}

export async function fulfillManyAction(slug: string, ids: string[]): Promise<FormResult<{ done: number; skipped: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const clean = ids.filter(isUuid).slice(0, 100);
  if (!clean.length) return { ok: false, error: "กรุณาเลือกรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminFulfillMany(tx, ctx.tenant.id, clean, actorOf(ctx)));
  revalidateTopup(slug);
  return { ok: true, message: r.skipped ? `เติมสำเร็จ ${r.done} รายการ (ข้าม ${r.skipped} รายการที่สถานะไม่พร้อม)` : `เติมสำเร็จ ${r.done} รายการ`, data: r };
}

export async function failOrderAction(slug: string, orderId: string, reason: string): Promise<FormResult<{ refunded: boolean; refundRequired: boolean }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const parsed = failSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminFailOrder(tx, ctx.tenant.id, orderId, parsed.data.reason, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  const msg = r.value.refunded ? "บันทึกเติมไม่สำเร็จ และคืนเงินเข้ากระเป๋าลูกค้าแล้ว" : r.value.refundRequired ? "บันทึกเติมไม่สำเร็จแล้ว — รายการนี้ชำระผ่านช่องทางอื่น กรุณาคืนเงินลูกค้าด้วยตนเอง" : "บันทึกเติมไม่สำเร็จแล้ว";
  return { ok: true, message: msg, data: { refunded: r.value.refunded, refundRequired: r.value.refundRequired } };
}

export async function retryOrderAction(slug: string, orderId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminRetryOrder(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  revalidateTopup(slug, paths(orderId));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: `ลองใหม่สำเร็จ · อ้างอิง ${r.value.supplierRef ?? "-"}` };
}

export async function cancelOrderAction(slug: string, orderId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminCancelOrder(tx, ctx.tenant.id, orderId, reason.trim().slice(0, 300) || null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  return { ok: true, message: "ยกเลิกรายการแล้ว" };
}

export async function approveSlipAction(slug: string, orderId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminApproveSlip(tx, ctx.tenant.id, orderId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  const s = r.value.status;
  return { ok: true, message: s === "fulfilled" ? "อนุมัติสลิปและเติมสำเร็จแล้ว" : s === "processing" ? "อนุมัติสลิปแล้ว — รายการเข้าคิวรอเติม" : "อนุมัติสลิปแล้ว" };
}

export async function rejectSlipAction(slug: string, orderId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminRejectSlip(tx, ctx.tenant.id, orderId, reason.trim().slice(0, 300) || "สลิปไม่ถูกต้อง", actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  return { ok: true, message: "ปฏิเสธสลิปแล้ว ลูกค้าสามารถแนบสลิปใหม่ได้" };
}

const noteSchema = z.string().trim().min(1, "กรุณาพิมพ์โน้ต").max(1000);

export async function addNoteAction(slug: string, orderId: string, text: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(orderId)) return { ok: false, error: "ไม่พบรายการ" };
  const parsed = noteSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาพิมพ์โน้ต" };
  const r = await tenantTx(ctx.tenant.id, (tx) => addOrderNote(tx, ctx.tenant.id, orderId, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(orderId));
  return { ok: true, message: "เพิ่มโน้ตแล้ว" };
}

/** Proof-of-delivery screenshot for manual fulfilment. */
export async function uploadProofAction(slug: string, fd: FormData): Promise<FormResult<{ url: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  return storeImage(ctx.tenant.id, "topup-proof", fd.get("file"));
}
