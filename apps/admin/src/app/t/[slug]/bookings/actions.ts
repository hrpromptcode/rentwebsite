"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { getAdminDb } from "@rentweb/db";
import {
  adminCancelBooking,
  adminReschedule,
  adminSlotsForDate,
  approveDeposit,
  createAdminBooking,
  loadModuleConfig,
  recordCashDeposit,
  refundDeposit,
  rejectDeposit,
  searchCustomers,
  setInternalNote,
  transitionBooking,
  type Actor,
  type CustomerHit,
} from "@rentweb/module-booking/admin";
import { ACTION_LABEL, type BookingAction } from "@rentweb/module-booking/admin/labels";
import { cancelSchema, fieldErrors, internalNoteSchema, rescheduleSchema, walkInSchema, type FormResult, type WalkInInput } from "@rentweb/module-booking/admin/schemas";
import type { SlotChip } from "@rentweb/module-booking/admin/ui";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidate(slug: string, ...ids: Array<string | null | undefined>) {
  revalidatePath(`/t/${slug}/bookings`);
  revalidatePath(`/t/${slug}/dashboard`);
  for (const id of ids) if (id) revalidatePath(`/t/${slug}/bookings/${id}`);
}

const ACTIONS: BookingAction[] = ["confirm", "check_in", "start", "complete", "no_show"];

/** Slot chips for the walk-in / reschedule pickers (admin engine: no notice period, offline staff allowed). */
export async function adminSlotsAction(slug: string, input: { serviceId: string; date: string; staffId: string | null }): Promise<FormResult<SlotChip[]>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(input.serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "ข้อมูลไม่ครบ" };
  const staffId = input.staffId && isUuid(input.staffId) ? input.staffId : null;
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => adminSlotsForDate(tx, ctx.tenant.id, { serviceId: input.serviceId, date: input.date, staffId, config: cfg.adminBooking }));
  if (!r) return { ok: false, error: "ไม่พบบริการ" };
  return { ok: true, data: r.slots.map((s) => ({ start: s.start, end: s.end, available: s.available, remaining: s.remaining })) };
}

export async function searchCustomersAction(slug: string, q: string): Promise<CustomerHit[]> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (q.trim().length < 2) return [];
  return tenantTx(ctx.tenant.id, (tx) => searchCustomers(tx, ctx.tenant.id, q.slice(0, 60)));
}

export async function createWalkInAction(slug: string, input: WalkInInput): Promise<FormResult<{ id: string; number: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) =>
    createAdminBooking(
      tx,
      ctx.tenant.id,
      { serviceId: v.serviceId, staffId: v.staffId, start: v.start, customer: { id: v.customerId, name: v.name, phone: v.phone, email: v.email }, note: v.note, partySize: v.partySize, source: v.source },
      cfg.adminBooking,
      actorOf(ctx),
    ),
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, r.value.id);
  return { ok: true, message: `สร้างการจอง ${r.value.number} แล้ว (ยืนยันแล้ว)`, data: { id: r.value.id, number: r.value.number } };
}

export async function transitionBookingAction(slug: string, id: string, action: BookingAction): Promise<FormResult<{ status: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id) || !ACTIONS.includes(action)) return { ok: false, error: "คำสั่งไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => transitionBooking(tx, ctx.tenant.id, id, action, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: `${ACTION_LABEL[action]}แล้ว`, data: r.value };
}

export async function cancelBookingAction(slug: string, id: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการจอง" };
  const parsed = cancelSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาระบุเหตุผล" };
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => adminCancelBooking(tx, ctx.tenant.id, id, parsed.data.reason, cfg.booking, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: "ยกเลิกการจองแล้ว" };
}

export async function rescheduleBookingAction(slug: string, id: string, input: { start: string; staffId: string | null }): Promise<FormResult<{ id: string; number: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการจอง" };
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาเลือกเวลา" };
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => adminReschedule(tx, ctx.tenant.id, id, { start: parsed.data.start, staffId: parsed.data.staffId }, cfg.adminBooking, actorOf(ctx), { settings: (ctx.tenant.settings ?? {}) as Record<string, unknown> }));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id, r.value.id);
  return { ok: true, message: `เลื่อนนัดแล้ว — การจองใหม่ ${r.value.number}`, data: { id: r.value.id, number: r.value.number } };
}

export async function saveInternalNoteAction(slug: string, id: string, note: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการจอง" };
  const parsed = internalNoteSchema.safeParse({ note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "โน้ตยาวเกินไป" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setInternalNote(tx, ctx.tenant.id, id, parsed.data.note));
  if (!done) return { ok: false, error: "ไม่พบการจอง" };
  revalidate(slug, id);
  return { ok: true, message: "บันทึกโน้ตแล้ว" };
}

export async function approveDepositAction(slug: string, bookingId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(bookingId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => approveDeposit(tx, ctx.tenant.id, bookingId, paymentId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, bookingId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "ยืนยันมัดจำแล้ว — ยืนยันนัดให้ลูกค้าอัตโนมัติ" };
}

export async function rejectDepositAction(slug: string, bookingId: string, paymentId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(bookingId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const why = reason.trim();
  if (!why) return { ok: false, error: "กรุณาระบุเหตุผลที่ปฏิเสธสลิป" };
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectDeposit(tx, ctx.tenant.id, bookingId, paymentId, why.slice(0, 300), actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, bookingId);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว — ลูกค้าสามารถส่งสลิปใหม่ได้" };
}

export async function refundDepositAction(slug: string, bookingId: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(bookingId) || !isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => refundDeposit(tx, ctx.tenant.id, bookingId, paymentId, null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, bookingId);
  return { ok: true, message: "บันทึกการคืนมัดจำแล้ว" };
}

export async function cashDepositAction(slug: string, bookingId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(bookingId)) return { ok: false, error: "ไม่พบการจอง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => recordCashDeposit(tx, ctx.tenant.id, bookingId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, bookingId);
  return { ok: true, message: "รับมัดจำเงินสดแล้ว" };
}
