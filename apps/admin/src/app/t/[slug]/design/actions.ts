"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, getAdminDb, media, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { resolveTheme, themeSchema, type ThemeInput } from "@rentweb/core/theme";
import { getStorage, IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey } from "@rentweb/core/storage";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantHostnames, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

export interface SaveThemeResult {
  ok: true;
  message: string;
  warnings: string[];
}

export async function saveTheme(slug: string, input: ThemeInput): Promise<SaveThemeResult | { ok: false; error: string }> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลธีมไม่ถูกต้อง" };
  const theme = parsed.data;

  // Custom CSS is a Business+ feature
  if (theme.customCss && !["business", "enterprise"].includes(ctx.tenant.planKey)) theme.customCss = null;

  const db = getAdminDb();
  const onboarding = { ...(ctx.tenant.onboarding ?? {}) } as { steps?: Record<string, boolean> };
  onboarding.steps = { ...(onboarding.steps ?? {}), theme: true, ...(theme.brand.logo ? { logo: true } : {}) };
  await db
    .update(tenants)
    .set({ theme: theme as Record<string, unknown>, onboarding: onboarding as Record<string, unknown> })
    .where(eq(tenants.id, ctx.tenant.id));
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "theme.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { preset: theme.preset } });
  revalidatePath(`/t/${slug}/design`);
  revalidatePath(`/t/${slug}/dashboard`);
  return { ok: true, message: "บันทึกธีมแล้ว", warnings: resolveTheme(theme).warnings };
}

const uploadSchema = z.object({ folder: z.enum(["brand", "media"]).default("brand") });

export async function uploadBrandAsset(slug: string, fd: FormData): Promise<ActionResult & { url?: string }> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  if (!IMAGE_MIMES.has(file.type)) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, SVG)" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const { folder } = uploadSchema.parse({ folder: fd.get("folder") ?? "brand" });

  const key = objectKey(ctx.tenant.id, folder, file.name);
  const stored = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  await tenantTx(ctx.tenant.id, (tx) =>
    tx.insert(media).values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: stored.mime, size: stored.size, folder: `/${folder}`, alt: file.name, createdBy: ctx.userId }),
  );
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "media.upload", targetType: "media", diff: { key: stored.key, folder } });
  return { ok: true, message: "อัปโหลดแล้ว", url: stored.url };
}
