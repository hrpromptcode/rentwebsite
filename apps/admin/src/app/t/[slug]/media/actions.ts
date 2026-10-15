"use server";

import { revalidatePath } from "next/cache";
import { and, eq, media } from "@rentweb/db";
import { getStorage, IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey } from "@rentweb/core/storage";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

const ALLOWED = new Set([...IMAGE_MIMES, "application/pdf", "video/mp4", "video/webm"]);

export async function uploadMedia(slug: string, fd: FormData): Promise<ActionResult & { uploaded?: number }> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  if (files.length > 20) return { ok: false, error: "อัปโหลดได้สูงสุด 20 ไฟล์ต่อครั้ง" };
  const folder = String(fd.get("folder") ?? "media").replace(/[^a-z0-9-]/gi, "") || "media";

  const storage = getStorage();
  const rows: Array<typeof media.$inferInsert> = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      errors.push(`${file.name}: ชนิดไฟล์ไม่รองรับ`);
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: ใหญ่เกิน 10 MB`);
      continue;
    }
    const key = objectKey(ctx.tenant.id, folder, file.name);
    const stored = await storage.put(key, Buffer.from(await file.arrayBuffer()), file.type);
    rows.push({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: stored.mime, size: stored.size, folder: `/${folder}`, alt: file.name.replace(/\.[^.]+$/, ""), createdBy: ctx.userId });
  }
  if (rows.length) {
    await tenantTx(ctx.tenant.id, (tx) => tx.insert(media).values(rows));
    await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "media.upload", targetType: "media", diff: { count: rows.length } });
  }
  revalidatePath(`/t/${slug}/media`);
  if (rows.length === 0) return { ok: false, error: errors.join(" · ") };
  return { ok: true, message: errors.length ? `อัปโหลด ${rows.length} ไฟล์ (ข้าม ${errors.length})` : `อัปโหลด ${rows.length} ไฟล์แล้ว`, uploaded: rows.length };
}

export async function deleteMedia(slug: string, mediaId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    const [m] = await tx.select().from(media).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId))).limit(1);
    if (!m) return null;
    await tx.delete(media).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId)));
    return m;
  });
  if (!row) return { ok: false, error: "ไม่พบไฟล์" };
  await getStorage().delete(row.key).catch(() => {});
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "media.delete", targetType: "media", targetId: mediaId, diff: { key: row.key } });
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "ลบไฟล์แล้ว" };
}

export async function updateMediaAlt(slug: string, mediaId: string, alt: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  await tenantTx(ctx.tenant.id, (tx) => tx.update(media).set({ alt: alt.slice(0, 200) }).where(and(eq(media.tenantId, ctx.tenant.id), eq(media.id, mediaId))));
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "บันทึกคำบรรยายแล้ว" };
}
