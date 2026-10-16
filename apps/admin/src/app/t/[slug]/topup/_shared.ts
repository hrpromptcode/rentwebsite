import "server-only";
import { revalidatePath } from "next/cache";
import { getStorage, IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey } from "@rentweb/core/storage";
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

/** Stores an uploaded image and returns an absolute URL usable by both the admin and the storefront. */
export async function storeImage(tenantId: string, folder: string, file: unknown): Promise<FormResult<{ url: string }>> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  if (!IMAGE_MIMES.has(file.type)) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const stored = await getStorage().put(objectKey(tenantId, folder, file.name), Buffer.from(await file.arrayBuffer()), file.type);
  const url = stored.url.startsWith("/") ? `${(process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "")}${stored.url}` : stored.url;
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url } };
}
