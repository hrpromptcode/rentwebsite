"use server";

import { revalidatePath } from "next/cache";
import { media } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import { deleteCategory, deleteService, saveCategory, saveClassSessions, saveService, setServiceFlags, uniqueServiceSlug, type Actor } from "@rentweb/module-booking/admin";
import { categorySchema, classSessionsSchema, fieldErrors, serviceSchema, type CategoryInput, type ClassSessionsInput, type FormResult, type ServiceInput } from "@rentweb/module-booking/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidate(slug: string, id?: string) {
  revalidatePath(`/t/${slug}/services`);
  revalidatePath(`/t/${slug}/bookings/new`);
  if (id) revalidatePath(`/t/${slug}/services/${id}`);
}

export async function saveServiceAction(slug: string, id: string | null, input: ServiceInput): Promise<FormResult<{ id: string; slug: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบบริการ" };
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveService(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidate(slug, r.value.id);
  return { ok: true, message: id ? "บันทึกบริการแล้ว" : "สร้างบริการแล้ว", data: r.value };
}

/** Weekly timetable of a class (course template): replaces the availability_rules rows with service_id = serviceId. */
export async function saveClassSessionsAction(slug: string, input: ClassSessionsInput): Promise<FormResult<{ count: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = classSessionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveClassSessions(tx, ctx.tenant.id, parsed.data.serviceId, parsed.data.sessions, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, parsed.data.serviceId);
  revalidatePath(`/t/${slug}/bookings`);
  return { ok: true, message: `บันทึกรอบเรียนแล้ว (${r.value.count} รอบ/สัปดาห์)`, data: r.value };
}

export async function suggestServiceSlugAction(slug: string, name: string, excludeId?: string | null): Promise<string> {
  const ctx = await getTenantCtx(slug);
  return tenantTx(ctx.tenant.id, (tx) => uniqueServiceSlug(tx, ctx.tenant.id, name || "service", excludeId));
}

export async function toggleServiceFlagAction(slug: string, id: string, flags: { active?: boolean; featured?: boolean }): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบบริการ" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setServiceFlags(tx, ctx.tenant.id, id, flags, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบบริการ" };
  revalidate(slug, id);
  const msg = flags.active === false ? "ปิดการใช้งานบริการแล้ว (ซ่อนจากหน้าร้าน)" : flags.active === true ? "เปิดใช้งานบริการแล้ว" : flags.featured ? "ปักหมุดเป็นบริการแนะนำแล้ว" : "เอาออกจากบริการแนะนำแล้ว";
  return { ok: true, message: msg };
}

export async function deleteServiceAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบบริการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteService(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: "ลบบริการแล้ว" };
}

export async function saveCategoryAction(slug: string, id: string | null, input: CategoryInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบหมวดหมู่" };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveCategory(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidate(slug);
  return { ok: true, message: id ? "บันทึกหมวดหมู่แล้ว" : "สร้างหมวดหมู่แล้ว", data: r.value };
}

export async function deleteCategoryAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหมวดหมู่" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteCategory(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบหมวดหมู่" };
  revalidate(slug);
  return { ok: true, message: "ลบหมวดหมู่แล้ว (บริการในหมวดยังอยู่)" };
}

const UPLOAD_FOLDERS = new Set(["services", "staff", "clinic", "booking"]);

/**
 * Shared by services / staff / clinic forms (folder = "services" | "staff" | "clinic"). The bytes decide the type
 * (sniffImage: JPG / PNG / WebP / GIF / AVIF, never SVG / HTML) – not the client's file.type / file.name – and the
 * object is stored with the sniffed extension + MIME. Local uploads land in the storefront's uploads dir (core storage, AC-01).
 */
export async function uploadBookingImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string; mediaId: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกรูปภาพ" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const wanted = String(fd.get("folder") ?? "booking").replace(/[^a-z0-9-]/gi, "");
  const folder = UPLOAD_FOLDERS.has(wanted) ? wanted : "booking";
  const key = objectKey(ctx.tenant.id, folder, `${folder}.${sniffed.ext}`);
  const stored = await getStorage().put(key, buf, sniffed.mime);
  const [row] = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .insert(media)
      .values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: sniffed.mime, size: stored.size, folder: `/${folder}`, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 200), createdBy: ctx.userId })
      .returning({ id: media.id }),
  );
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url, mediaId: row!.id } };
}
