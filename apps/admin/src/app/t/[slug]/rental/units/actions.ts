"use server";

import { revalidatePath } from "next/cache";
import { media } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import { deleteExtra, deleteUnitType, saveExtra, saveUnitType, setUnitTypeFlags, uniqueUnitTypeSlug } from "@rentweb/module-rental/admin";
import { extraSchema, fieldErrors, unitTypeSchema, type ExtraInput, type FormResult, type UnitTypeInput } from "@rentweb/module-rental/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf } from "../_lib";

function revalidate(slug: string, id?: string) {
  revalidatePath(`/t/${slug}/rental/units`);
  revalidatePath(`/t/${slug}/rental/calendar`);
  revalidatePath(`/t/${slug}/rental/rates`);
  if (id) revalidatePath(`/t/${slug}/rental/units/${id}`);
}

export async function saveUnitTypeAction(slug: string, id: string | null, input: UnitTypeInput): Promise<FormResult<{ id: string; slug: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบประเภทห้องพัก" };
  const parsed = unitTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveUnitType(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidate(slug, r.value.id);
  return { ok: true, message: id ? "บันทึกประเภทห้องพักแล้ว" : "สร้างประเภทห้องพักแล้ว", data: r.value };
}

export async function suggestUnitSlugAction(slug: string, name: string, excludeId?: string | null): Promise<string> {
  const ctx = await getTenantCtx(slug);
  return tenantTx(ctx.tenant.id, (tx) => uniqueUnitTypeSlug(tx, ctx.tenant.id, name || "room", excludeId));
}

export async function toggleUnitTypeAction(slug: string, id: string, flags: { active?: boolean; featured?: boolean }): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบประเภทห้องพัก" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setUnitTypeFlags(tx, ctx.tenant.id, id, flags, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบประเภทห้องพัก" };
  revalidate(slug, id);
  return { ok: true, message: flags.active === false ? "ปิดการขายประเภทห้องนี้แล้ว (ซ่อนจากหน้าร้าน)" : flags.active === true ? "เปิดขายแล้ว" : flags.featured ? "ปักหมุดเป็นห้องแนะนำแล้ว" : "เอาออกจากห้องแนะนำแล้ว" };
}

export async function deleteUnitTypeAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบประเภทห้องพัก" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteUnitType(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug, id);
  return { ok: true, message: "ลบประเภทห้องพักแล้ว" };
}

export async function saveExtraAction(slug: string, id: string | null, input: ExtraInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบบริการเสริม" };
  const parsed = extraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveExtra(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: id ? "บันทึกบริการเสริมแล้ว" : "เพิ่มบริการเสริมแล้ว", data: r.value };
}

export async function deleteExtraAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบบริการเสริม" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteExtra(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบบริการเสริม" };
  revalidate(slug);
  return { ok: true, message: "ลบบริการเสริมแล้ว (การจองเดิมยังเก็บราคาที่ซื้อไว้)" };
}

/**
 * Gallery upload: the bytes decide the type (sniffImage: JPG / PNG / WebP / GIF / AVIF, never SVG / HTML), stored with
 * the sniffed extension + MIME under the tenant's "rental" folder, and listed in the media library.
 */
export async function uploadRentalImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string; mediaId: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกรูปภาพ" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const key = objectKey(ctx.tenant.id, "rental", `room.${sniffed.ext}`);
  const stored = await getStorage().put(key, buf, sniffed.mime);
  const [row] = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .insert(media)
      .values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: sniffed.mime, size: stored.size, folder: "/rental", alt: file.name.replace(/\.[^.]+$/, "").slice(0, 200), createdBy: ctx.userId })
      .returning({ id: media.id }),
  );
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url, mediaId: row!.id } };
}
