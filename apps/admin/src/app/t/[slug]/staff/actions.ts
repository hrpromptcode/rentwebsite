"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { addTimeOff, deleteStaff, removeTimeOff, saveSchedule, saveStaff, setStaffFlags, uniqueStaffSlug, type Actor } from "@rentweb/module-booking/admin";
import { fieldErrors, scheduleSchema, staffSchema, timeOffSchema, type FormResult, type ScheduleInput, type StaffInput, type TimeOffInput } from "@rentweb/module-booking/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidate(slug: string, id?: string | null) {
  revalidatePath(`/t/${slug}/staff`);
  revalidatePath(`/t/${slug}/bookings`);
  revalidatePath(`/t/${slug}/services`);
  if (id) revalidatePath(`/t/${slug}/staff/${id}`);
}

export async function saveStaffAction(slug: string, id: string | null, input: StaffInput): Promise<FormResult<{ id: string; slug: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบพนักงาน" };
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveStaff(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidate(slug, r.value.id);
  return { ok: true, message: id ? "บันทึกข้อมูลพนักงานแล้ว" : "เพิ่มพนักงานแล้ว", data: r.value };
}

export async function suggestStaffSlugAction(slug: string, name: string, excludeId?: string | null): Promise<string> {
  const ctx = await getTenantCtx(slug);
  return tenantTx(ctx.tenant.id, (tx) => uniqueStaffSlug(tx, ctx.tenant.id, name || "staff", excludeId));
}

export async function toggleStaffFlagAction(slug: string, id: string, flags: { active?: boolean; acceptsOnlineBooking?: boolean }): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบพนักงาน" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setStaffFlags(tx, ctx.tenant.id, id, flags, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบพนักงาน" };
  revalidate(slug, id);
  const msg =
    flags.active === false
      ? "ปิดการใช้งานแล้ว (ไม่แสดงในปฏิทินและหน้าร้าน)"
      : flags.active === true
        ? "เปิดใช้งานแล้ว"
        : flags.acceptsOnlineBooking
          ? "เปิดรับจองออนไลน์แล้ว"
          : "ปิดรับจองออนไลน์แล้ว (ยังจองผ่านแอดมินได้)";
  return { ok: true, message: msg };
}

export async function deleteStaffAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบพนักงาน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteStaff(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: "ลบพนักงานแล้ว" };
}

/** Weekly schedule of a staff, or the shop's business hours when staffId is null. */
export async function saveScheduleAction(slug: string, input: ScheduleInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบเวลา", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.staffId && !v.inherit && v.days.every((d) => d.closed)) return { ok: false, error: "ปิดทุกวันไม่ได้ — หากพนักงานหยุดยาวให้เพิ่ม “วันหยุด/ลา” หรือปิดการใช้งานแทน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveSchedule(tx, ctx.tenant.id, v, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, v.staffId);
  return { ok: true, message: v.staffId ? (v.inherit ? "ใช้เวลาทำการของร้านแล้ว" : "บันทึกตารางงานแล้ว") : "บันทึกเวลาทำการของร้านแล้ว" };
}

export async function addTimeOffAction(slug: string, input: TimeOffInput): Promise<FormResult<{ affected: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบช่วงเวลา", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => addTimeOff(tx, ctx.tenant.id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, parsed.data.staffId);
  return {
    ok: true,
    message: r.value.affected ? `บันทึกวันหยุดแล้ว — มีคิว ${r.value.affected} รายการในช่วงนี้ กรุณาเลื่อนหรือแจ้งลูกค้า` : "บันทึกวันหยุดแล้ว",
    data: { affected: r.value.affected },
  };
}

export async function removeTimeOffAction(slug: string, id: string, staffId: string | null): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการ" };
  const done = await tenantTx(ctx.tenant.id, (tx) => removeTimeOff(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบรายการ" };
  revalidate(slug, staffId);
  return { ok: true, message: "ลบวันหยุดแล้ว" };
}
