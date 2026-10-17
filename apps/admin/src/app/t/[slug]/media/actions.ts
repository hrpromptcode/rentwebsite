"use server";

import { revalidatePath } from "next/cache";
import { and, eq, media } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { getStorage, MAX_UPLOAD_BYTES, MEDIA_LIBRARY_KINDS, objectKey, sniffUpload, type SniffedFileKind } from "@rentweb/core/storage";
import { auditLog } from "@/lib/audit";
import { getTenantCtx, hasRole, tenantTx, type TenantCtx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";
import { MAX_FILES_PER_UPLOAD, MEDIA_TYPES_LABEL, SECTION_IMAGE_TYPES_LABEL, tooLargeMessage } from "./limits";
import { findMediaUsage as findUsage, type MediaUsage } from "./usage";

const NO_PERMISSION = "คุณไม่มีสิทธิ์อัปโหลดไฟล์";
/** Section image fields only take pictures (no PDF / video URLs in an <img>). */
const SECTION_IMAGE_KINDS: readonly SniffedFileKind[] = ["jpeg", "png", "webp", "gif", "avif"];

type Stored = { id: string; url: string; mime: string; name: string };

/** Sniffs, stores and records each file; per-file problems are returned as Thai messages instead of failing the batch. */
async function storeFiles(ctx: TenantCtx, files: File[], kinds: readonly SniffedFileKind[], folder: string, typesLabel: string): Promise<{ stored: Stored[]; errors: string[] }> {
  const storage = getStorage();
  const rows: Array<typeof media.$inferInsert> = [];
  const names: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(tooLargeMessage(file.name, file.size));
      continue;
    }
    // trust the bytes, not the declared type / file name: no SVG / HTML disguised as an image or PDF
    const buf = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffUpload(buf, kinds);
    if (!sniffed) {
      errors.push(`${file.name}: ชนิดไฟล์ไม่รองรับ (${typesLabel})`);
      continue;
    }
    const key = objectKey(ctx.tenant.id, folder, `file.${sniffed.ext}`);
    const put = await storage.put(key, buf, sniffed.mime);
    rows.push({ tenantId: ctx.tenant.id, key: put.key, url: put.url, mime: put.mime, size: put.size, folder: `/${folder}`, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 200), createdBy: ctx.userId });
    names.push(file.name);
  }
  let stored: Stored[] = [];
  if (rows.length) {
    const inserted = await tenantTx(ctx.tenant.id, (tx) => tx.insert(media).values(rows).returning({ id: media.id, url: media.url, mime: media.mime }));
    stored = inserted.map((r, i) => ({ ...r, name: names[i] ?? "" }));
    await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "media.upload", targetType: "media", diff: { count: rows.length, folder } });
  }
  return { stored, errors };
}

/**
 * Media library upload. The client sends ONE file per request (ADMIN_B2-15) so a big file cannot push the request
 * body over the server-action / proxy limits and lose the whole batch; several files are still accepted.
 */
export async function uploadMedia(slug: string, fd: FormData): Promise<ActionResult & { uploaded?: number; items?: Stored[] }> {
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "staff")) return { ok: false, error: NO_PERMISSION };
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  if (files.length > MAX_FILES_PER_UPLOAD) return { ok: false, error: `อัปโหลดได้สูงสุด ${MAX_FILES_PER_UPLOAD} ไฟล์ต่อครั้ง` };
  const folder = String(fd.get("folder") ?? "media").replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "media";

  const { stored, errors } = await storeFiles(ctx, files, MEDIA_LIBRARY_KINDS, folder, MEDIA_TYPES_LABEL);
  revalidatePath(`/t/${slug}/media`);
  if (stored.length === 0) return { ok: false, error: errors.join(" · ") };
  return { ok: true, message: errors.length ? `อัปโหลด ${stored.length} ไฟล์ (ข้าม ${errors.length}: ${errors.join(" · ")})` : `อัปโหลด ${stored.length} ไฟล์แล้ว`, uploaded: stored.length, items: stored };
}

/**
 * ADMIN_B2-14: image upload for page-builder section fields. Same role as saving a page draft (staff+),
 * stored in the media library; failures come back as a Result (never thrown) so the editor can toast them.
 */
export async function uploadSectionImage(slug: string, fd: FormData): Promise<ActionResult & { url?: string }> {
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "staff")) return { ok: false, error: NO_PERMISSION };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  const { stored, errors } = await storeFiles(ctx, [file], SECTION_IMAGE_KINDS, "media", SECTION_IMAGE_TYPES_LABEL);
  revalidatePath(`/t/${slug}/media`);
  const first = stored[0];
  if (!first) return { ok: false, error: errors[0] ?? "อัปโหลดไม่สำเร็จ" };
  return { ok: true, message: "อัปโหลดรูปแล้ว", url: first.url };
}

/** ADMIN_B2-17: pages / products / theme … that reference this file. */
export async function getMediaUsage(slug: string, mediaId: string): Promise<ActionResult & { usages?: MediaUsage[] }> {
  const ctx = await getTenantCtx(slug);
  if (!isUuid(mediaId)) return { ok: false, error: "ไม่พบไฟล์" };
  const res = await tenantTx(ctx.tenant.id, async (tx) => {
    const [m] = await tx.select({ key: media.key, url: media.url }).from(media).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId))).limit(1);
    if (!m) return null;
    return findUsage(tx, ctx.tenant.id, m, ctx.tenant.theme);
  });
  if (!res) return { ok: false, error: "ไม่พบไฟล์" };
  return { ok: true, usages: res };
}

/**
 * Deletes a media file. A file that is still referenced is only deleted with `confirmInUse: true`
 * (the library shows the usages and asks first); otherwise the usages are returned with ok:false.
 */
export async function deleteMedia(slug: string, mediaId: string, opts: { confirmInUse?: boolean } = {}): Promise<ActionResult & { usages?: MediaUsage[] }> {
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) return { ok: false, error: "คุณไม่มีสิทธิ์ลบไฟล์" };
  if (!isUuid(mediaId)) return { ok: false, error: "ไม่พบไฟล์" };
  const res = await tenantTx(ctx.tenant.id, async (tx) => {
    const [m] = await tx.select().from(media).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId))).limit(1);
    if (!m) return null;
    const usages = await findUsage(tx, ctx.tenant.id, m, ctx.tenant.theme);
    if (usages.length && !opts.confirmInUse) return { row: m, usages, deleted: false };
    await tx.delete(media).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId)));
    return { row: m, usages, deleted: true };
  });
  if (!res) return { ok: false, error: "ไม่พบไฟล์" };
  if (!res.deleted) {
    const list = res.usages.slice(0, 5).map((u) => `${u.kind} “${u.label}”`).join(", ");
    return { ok: false, error: `ไฟล์นี้ยังถูกใช้อยู่ใน ${list}${res.usages.length > 5 ? ` และอีก ${res.usages.length - 5} แห่ง` : ""}`, usages: res.usages };
  }
  await getStorage().delete(res.row.key).catch(() => {});
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "media.delete", targetType: "media", targetId: mediaId, diff: { key: res.row.key, ...(res.usages.length ? { inUse: res.usages.map((u) => `${u.kind}: ${u.label}`) } : {}) } });
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: res.usages.length ? `ลบไฟล์แล้ว — ${res.usages.length} จุดที่ใช้ไฟล์นี้จะไม่แสดงรูป` : "ลบไฟล์แล้ว" };
}

export async function updateMediaAlt(slug: string, mediaId: string, alt: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "staff")) return { ok: false, error: "คุณไม่มีสิทธิ์แก้ไขไฟล์" };
  if (!isUuid(mediaId)) return { ok: false, error: "ไม่พบไฟล์" };
  await tenantTx(ctx.tenant.id, (tx) => tx.update(media).set({ alt: String(alt ?? "").slice(0, 200) }).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId))));
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "บันทึกคำบรรยายแล้ว" };
}
