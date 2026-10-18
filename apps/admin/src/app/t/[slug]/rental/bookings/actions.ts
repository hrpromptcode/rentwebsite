"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { getAdminDb } from "@rentweb/db";
import { adminCancelStay, adminTransition, approveStayPayment, loadRentalModuleConfig, recordCashStayPayment, refundStayPayment, rejectStayPayment, setStayNotes } from "@rentweb/module-rental/admin";
import { ACTION_LABEL, type StayAdminAction } from "@rentweb/module-rental/admin/labels";
import { cancelSchema, fieldErrors, notesSchema, type FormResult, type NotesInput } from "@rentweb/module-rental/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf } from "../_lib";

function revalidate(slug: string, ...ids: Array<string | null | undefined>) {
  revalidatePath(`/t/${slug}/rental/bookings`);
  revalidatePath(`/t/${slug}/rental/calendar`);
  revalidatePath(`/t/${slug}/dashboard`);
  for (const id of ids) if (id) revalidatePath(`/t/${slug}/rental/bookings/${id}`);
}

const ACTIONS: StayAdminAction[] = ["confirm", "check_in", "check_out", "no_show"];

export async function transitionStayAction(slug: string, id: string, action: StayAdminAction): Promise<FormResult<{ status: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id) || !ACTIONS.includes(action)) return { ok: false, error: "คำสั่งไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => adminTransition(tx, ctx.tenant.id, id, action, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: `${ACTION_LABEL[action]}แล้ว`, data: { status: r.value.status } };
}

export async function cancelStayAction(slug: string, id: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการจอง" };
  const parsed = cancelSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล" };
  const cfg = await loadRentalModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => adminCancelStay(tx, ctx.tenant.id, id, parsed.data.reason, cfg.rental, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: "ยกเลิกการจองแล้ว" };
}

export async function saveStayNotesAction(slug: string, id: string, input: NotesInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการจอง" };
  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const done = await tenantTx(ctx.tenant.id, (tx) => setStayNotes(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบการจอง" };
  revalidate(slug, id);
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function approvePaymentAction(slug: string, stayId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(stayId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => approveStayPayment(tx, ctx.tenant.id, stayId, paymentId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, stayId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "ยืนยันการชำระเงินแล้ว — ยืนยันการจองให้ลูกค้าอัตโนมัติ" };
}

export async function rejectPaymentAction(slug: string, stayId: string, paymentId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(stayId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const why = reason.trim();
  if (!why) return { ok: false, error: "กรุณาระบุเหตุผลที่ปฏิเสธสลิป" };
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectStayPayment(tx, ctx.tenant.id, stayId, paymentId, why.slice(0, 300), actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, stayId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว — ลูกค้าสามารถส่งสลิปใหม่ได้" };
}

export async function refundPaymentAction(slug: string, stayId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(stayId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => refundStayPayment(tx, ctx.tenant.id, stayId, paymentId, null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, stayId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "บันทึกการคืนเงินแล้ว" };
}

export async function cashPaymentAction(slug: string, stayId: string, which: "due" | "balance"): Promise<FormResult<{ amount: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(stayId)) return { ok: false, error: "ไม่พบการจอง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => recordCashStayPayment(tx, ctx.tenant.id, stayId, which, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, stayId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: which === "balance" ? "บันทึกรับชำระส่วนที่เหลือแล้ว" : "บันทึกรับเงินสดแล้ว — ยืนยันการจองแล้ว", data: r.value };
}
