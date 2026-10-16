"use server";

import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { media } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { getStorage, IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey } from "@rentweb/core/storage";
import { deleteCategory, deleteService, saveCategory, saveService, setServiceFlags, uniqueServiceSlug, type Actor } from "@rentweb/module-booking/admin";
import { categorySchema, fieldErrors, serviceSchema, type CategoryInput, type FormResult, type ServiceInput } from "@rentweb/module-booking/admin/schemas";
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

/** In dev the admin and storefront are separate Next apps; local uploads must land in the storefront's public dir to be served. */
function pointLocalStorageAtWeb() {
  if (process.env.R2_BUCKET || process.env.LOCAL_UPLOAD_DIR) return;
  const webDir = path.resolve(process.cwd(), "../web/public/uploads");
  if (existsSync(path.dirname(webDir))) process.env.LOCAL_UPLOAD_DIR = webDir;
}

/** Shared by services / staff / clinic forms (folder = "services" | "staff" | "clinic"). */
export async function uploadBookingImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string; mediaId: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกรูปภาพ" };
  if (!IMAGE_MIMES.has(file.type)) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const folder = String(fd.get("folder") ?? "booking").replace(/[^a-z0-9-]/gi, "") || "booking";
  pointLocalStorageAtWeb();
  const key = objectKey(ctx.tenant.id, folder, file.name);
  const stored = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  const [row] = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .insert(media)
      .values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: stored.mime, size: stored.size, folder: `/${folder}`, alt: file.name.replace(/\.[^.]+$/, ""), createdBy: ctx.userId })
      .returning({ id: media.id }),
  );
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url, mediaId: row!.id } };
}
