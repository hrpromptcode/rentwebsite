"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveReservationDeposit, createManualReservation, setReservationStatus, updateReservationNote } from "@rentweb/module-restaurant/admin";
import { bangkokDate } from "@rentweb/module-restaurant/services";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

export type FormResult = ActionResult & { fieldErrors?: Record<string, string> };
const uuid = z.string().uuid();

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/restaurant/reservations`);
}

const STATUS_MSG: Record<string, string> = { confirmed: "ยืนยันการจองแล้ว", seated: "บันทึกว่านั่งแล้ว", completed: "ปิดการจองแล้ว", no_show: "บันทึกว่าไม่มา", cancelled: "ยกเลิกการจองแล้ว" };

export async function setReservationStatusAction(slug: string, id: string, next: string, reason?: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = z.object({ id: uuid, next: z.enum(["confirmed", "seated", "completed", "no_show", "cancelled"]) }).safeParse({ id, next });
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => setReservationStatus(tx, ctx.tenant.id, parsed.data.id, parsed.data.next, reason ?? null));
  if (!r.ok) return { ok: false, error: r.error };
  if (parsed.data.next === "cancelled" || parsed.data.next === "no_show") {
    await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: `reservation.${parsed.data.next}`, targetType: "reservation", targetId: id, diff: { number: r.value.number, deposit: r.value.depositAmount } });
  }
  revalidate(slug);
  return { ok: true, message: `${r.value.number}: ${STATUS_MSG[parsed.data.next] ?? "อัปเดตแล้ว"}` };
}

export async function approveDepositAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => approveReservationDeposit(tx, ctx.tenant.id, id, ctx.userId));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "reservation.deposit_approved", targetType: "reservation", targetId: id, diff: { paymentId: r.value.paymentId } });
  revalidate(slug);
  return { ok: true, message: "รับมัดจำและยืนยันการจองแล้ว" };
}

const createSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า").max(120, "ชื่อยาวเกินไป"),
  phone: z.string().trim().min(9, "กรุณากรอกเบอร์โทรศัพท์").max(20, "เบอร์โทรไม่ถูกต้อง"),
  partySize: z.number().int("ต้องเป็นจำนวนเต็ม").min(1, "อย่างน้อย 1 คน").max(40, "ไม่เกิน 40 คน"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "กรุณาเลือกวันที่"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "กรุณาเลือกเวลา"),
  zone: z.string().trim().max(40).nullable().optional(),
  occasion: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(500, "หมายเหตุยาวเกินไป").nullable().optional(),
  force: z.boolean().optional(),
});
export type CreateReservationInput = z.input<typeof createSchema>;

export async function createReservationAction(slug: string, input: CreateReservationInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
    return { ok: false, error: "กรุณาตรวจสอบข้อมูล", fieldErrors };
  }
  const d = parsed.data;
  const startsAt = bangkokDate(d.date, d.time);
  const r = await tenantTx(ctx.tenant.id, (tx) => createManualReservation(tx, ctx.tenant.id, { name: d.name, phone: d.phone, partySize: d.partySize, startsAt, zone: d.zone ?? null, occasion: d.occasion ?? null, note: d.note ?? null, force: d.force, createdBy: ctx.userId }));
  if (!r.ok) {
    const field = r.code === "invalid_phone" ? "phone" : r.code === "past" || r.code === "invalid_time" ? "time" : r.code === "full" ? "force" : undefined;
    return { ok: false, error: r.error, fieldErrors: field ? { [field]: r.error } : undefined };
  }
  revalidate(slug);
  return { ok: true, message: `บันทึกการจอง ${r.value.number} แล้ว`, data: r.value };
}

export async function updateReservationNoteAction(slug: string, id: string, note: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => updateReservationNote(tx, ctx.tenant.id, id, note.slice(0, 500)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: "บันทึกหมายเหตุแล้ว" };
}
