import "server-only";
import { revalidatePath } from "next/cache";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import type { Actor } from "@rentweb/module-topup/admin";
import type { FormResult } from "@rentweb/module-topup/admin/schemas";
import type { TenantCtx } from "@/lib/tenant";

/** Audit actor derived from the tenant ctx (superadmin impersonation is recorded as such). */
export function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export function revalidateTopup(slug: string, paths: string[] = []) {
  revalidatePath(`/t/${slug}/topup/orders`);
  revalidatePath(`/t/${slug}/dashboard`);
  for (const p of paths) revalidatePath(`/t/${slug}${p}`);
}

/**
 * Stores an uploaded image (proof of delivery, game icon / banner) like every other module's admin upload
 * (payments-api.md section 7):
 * - ADMIN-02: the bytes decide the type (sniffImage: JPG / PNG / WebP / GIF / AVIF; never SVG / HTML / bogus bytes);
 *   the object key gets the sniffed extension and the object the sniffed MIME (never the client's file.type / name);
 * - ADMIN-13: the URL is returned exactly as the storage gives it – "/uploads/<key>" in development (the storefront
 *   serves it on every tenant host; the admin renders it through assetUrl()) or the R2 public URL in production.
 *   Never prefixed with the admin host, which does not serve /uploads.
 */
export async function storeImage(tenantId: string, folder: string, file: unknown): Promise<FormResult<{ url: string }>> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const stored = await getStorage().put(objectKey(tenantId, folder, `image.${sniffed.ext}`), buf, sniffed.mime);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url } };
}

/** Origin that serves relative "/uploads/…" URLs (the storefront in dev) – same base as assetUrl(). For client previews. */
export function assetBase(): string {
  return (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
