"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { getAdminDb } from "@rentweb/db";
import {
  cancelVisit,
  completeVisit,
  createPatient,
  createVisit,
  deletePackage,
  loadModuleConfig,
  openVisitFromBooking,
  saveVisit,
  savePackage,
  searchPatients,
  sellPackage,
  setConsent,
  setPackageActive,
  setPatientActive,
  updatePatient,
  usePackageSession,
  type Actor,
  type PatientHit,
} from "@rentweb/module-booking/admin";
import { CONSENTS } from "@rentweb/module-booking/admin/labels";
import {
  completeVisitSchema,
  fieldErrors,
  patientSchema,
  sellPackageSchema,
  visitCreateSchema,
  visitSchema,
  clinicPackageSchema,
  type ClinicPackageInput,
  type FormResult,
  type PatientInput,
  type VisitCreateInput,
  type VisitInput,
} from "@rentweb/module-booking/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

async function clinicCtx(slug: string, min: "staff" | "manager") {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, min);
  if (!ctx.modules.includes("clinic")) throw new Error("โมดูลคลินิกไม่ได้เปิดใช้");
  return ctx;
}

function revalidateClinic(slug: string, ...paths: Array<string | null | undefined>) {
  revalidatePath(`/t/${slug}/clinic/patients`);
  revalidatePath(`/t/${slug}/clinic/visits`);
  for (const p of paths) if (p) revalidatePath(`/t/${slug}/clinic/${p}`);
}

/* --------------------------------- patients --------------------------------- */

export async function searchPatientsAction(slug: string, q: string): Promise<PatientHit[]> {
  const ctx = await clinicCtx(slug, "staff");
  if (q.trim().length < 2) return [];
  return tenantTx(ctx.tenant.id, (tx) => searchPatients(tx, ctx.tenant.id, q.slice(0, 60)));
}

export async function createPatientAction(slug: string, input: PatientInput): Promise<FormResult<{ id: string; hn: string }>> {
  const ctx = await clinicCtx(slug, "staff");
  const parsed = patientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => createPatient(tx, ctx.tenant.id, parsed.data, { hnPrefix: cfg.clinic.hnPrefix }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: /เบอร์/.test(r.error) ? { phone: r.error } : undefined };
  revalidateClinic(slug);
  return { ok: true, message: `ลงทะเบียนผู้ป่วย ${r.value.hn} แล้ว`, data: r.value };
}

export async function updatePatientAction(slug: string, id: string, input: PatientInput): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบผู้ป่วย" };
  const parsed = patientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const done = await tenantTx(ctx.tenant.id, (tx) => updatePatient(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบผู้ป่วย" };
  revalidateClinic(slug, `patients/${id}`);
  return { ok: true, message: "บันทึกข้อมูลผู้ป่วยแล้ว" };
}

export async function setPatientActiveAction(slug: string, id: string, active: boolean): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบผู้ป่วย" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setPatientActive(tx, ctx.tenant.id, id, active, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบผู้ป่วย" };
  revalidateClinic(slug, `patients/${id}`);
  return { ok: true, message: active ? "เปิดใช้งานประวัติแล้ว" : "ปิดใช้งานประวัติแล้ว" };
}

export async function setConsentAction(slug: string, id: string, key: string, granted: boolean): Promise<FormResult<Record<string, { at: string; version: string; by?: string }>>> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(id) || !CONSENTS.some((c) => c.key === key)) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => setConsent(tx, ctx.tenant.id, id, key, granted, { version: cfg.clinic.consentVersion, by: ctx.userId }));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `patients/${id}`);
  return { ok: true, message: granted ? "บันทึกความยินยอมแล้ว" : "ถอนความยินยอมแล้ว", data: r.value };
}

export async function usePackageSessionAction(slug: string, patientPackageId: string, opts: { visitId?: string | null; patientId: string; note?: string | null }): Promise<FormResult<{ sessionsLeft: number; status: string }>> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(patientPackageId)) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  const visitId = opts.visitId && isUuid(opts.visitId) ? opts.visitId : null;
  const r = await tenantTx(ctx.tenant.id, (tx) => usePackageSession(tx, ctx.tenant.id, patientPackageId, { visitId, note: opts.note?.slice(0, 300) ?? null }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `patients/${opts.patientId}`, visitId ? `visits/${visitId}` : null);
  return { ok: true, message: r.value.status === "exhausted" ? "ใช้ครั้งสุดท้ายแล้ว — แพ็กเกจครบจำนวน" : `ใช้ 1 ครั้งแล้ว — เหลือ ${r.value.sessionsLeft} ครั้ง`, data: r.value };
}

export async function sellPackageAction(slug: string, patientId: string, input: { packageId: string; method: "cash" | "transfer" }): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(patientId)) return { ok: false, error: "ไม่พบผู้ป่วย" };
  const parsed = sellPackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "กรุณาเลือกแพ็กเกจและวิธีชำระ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => sellPackage(tx, ctx.tenant.id, { patientId, ...parsed.data }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `patients/${patientId}`, "packages");
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: "ขายแพ็กเกจและบันทึกรับเงินแล้ว" };
}

/* ---------------------------------- visits ---------------------------------- */

export async function createVisitAction(slug: string, input: VisitCreateInput): Promise<FormResult<{ id: string }>> {
  const ctx = await clinicCtx(slug, "staff");
  const parsed = visitCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาเลือกผู้ป่วย", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => createVisit(tx, ctx.tenant.id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `patients/${parsed.data.patientId}`);
  revalidatePath(`/t/${slug}/bookings`);
  return { ok: true, message: "เปิดการตรวจแล้ว", data: r.value };
}

export async function openVisitFromBookingAction(slug: string, bookingId: string): Promise<FormResult<{ id: string; patientId: string }>> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(bookingId)) return { ok: false, error: "ไม่พบการจอง" };
  const cfg = await loadModuleConfig(getAdminDb(), ctx.tenant.id);
  const r = await tenantTx(ctx.tenant.id, (tx) => openVisitFromBooking(tx, ctx.tenant.id, bookingId, { hnPrefix: cfg.clinic.hnPrefix }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `patients/${r.value.patientId}`);
  revalidatePath(`/t/${slug}/bookings`);
  return { ok: true, message: r.value.newPatient ? "ลงทะเบียนผู้ป่วยใหม่และเปิดการตรวจแล้ว" : "เปิดการตรวจแล้ว", data: { id: r.value.id, patientId: r.value.patientId } };
}

export async function saveVisitAction(slug: string, id: string, input: VisitInput): Promise<FormResult<{ total: number }>> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการตรวจ" };
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveVisit(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `visits/${id}`);
  return { ok: true, message: "บันทึกการตรวจแล้ว", data: r.value };
}

export async function completeVisitAction(slug: string, id: string, method: "cash" | "transfer" | "none"): Promise<FormResult<{ paymentStatus: string }>> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการตรวจ" };
  const parsed = completeVisitSchema.safeParse({ method });
  if (!parsed.success) return { ok: false, error: "วิธีชำระไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => completeVisit(tx, ctx.tenant.id, id, parsed.data.method, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `visits/${id}`);
  revalidatePath(`/t/${slug}/bookings`);
  revalidatePath(`/t/${slug}/payments`);
  return { ok: true, message: r.value.paymentStatus === "paid" ? "ปิดการตรวจและรับชำระเงินแล้ว" : "ปิดการตรวจแล้ว", data: r.value };
}

export async function cancelVisitAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบการตรวจ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => cancelVisit(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, `visits/${id}`);
  return { ok: true, message: "ยกเลิกการตรวจแล้ว" };
}

/* --------------------------------- packages --------------------------------- */

export async function savePackageAction(slug: string, id: string | null, input: ClinicPackageInput): Promise<FormResult<{ id: string }>> {
  const ctx = await clinicCtx(slug, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  const parsed = clinicPackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => savePackage(tx, ctx.tenant.id, id, input, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidateClinic(slug, "packages");
  return { ok: true, message: id ? "บันทึกแพ็กเกจแล้ว" : "สร้างแพ็กเกจแล้ว", data: r.value };
}

export async function setPackageActiveAction(slug: string, id: string, active: boolean): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setPackageActive(tx, ctx.tenant.id, id, active, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  revalidateClinic(slug, "packages");
  return { ok: true, message: active ? "เปิดขายแพ็กเกจแล้ว" : "ปิดการขายแพ็กเกจแล้ว" };
}

export async function deletePackageAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await clinicCtx(slug, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deletePackage(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateClinic(slug, "packages");
  return { ok: true, message: "ลบแพ็กเกจแล้ว" };
}
