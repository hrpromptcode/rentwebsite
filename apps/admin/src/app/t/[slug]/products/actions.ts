"use server";

import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { media } from "@rentweb/db";
import { isUuid, slugify } from "@rentweb/core";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import { archiveProduct, deleteCategory, saveCategory, saveProduct, setProductFeatured, setProductsStatus, uniqueProductSlug, type Actor, type SaveProductResult } from "@rentweb/module-commerce/admin";
import { categorySchema, fieldErrors, productSchema, type CategoryInput, type FormResult, type ProductInput } from "@rentweb/module-commerce/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidateProducts(slug: string, id?: string) {
  revalidatePath(`/t/${slug}/products`);
  revalidatePath(`/t/${slug}/products/categories`);
  if (id) revalidatePath(`/t/${slug}/products/${id}`);
}

export async function saveProductAction(slug: string, id: string | null, input: ProductInput): Promise<FormResult<SaveProductResult>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบสินค้า" };
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveProduct(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidateProducts(slug, r.value.id);
  return { ok: true, message: id ? "บันทึกสินค้าแล้ว" : "สร้างสินค้าแล้ว", data: r.value };
}

export async function suggestSlugAction(slug: string, name: string, excludeId?: string | null): Promise<string> {
  const ctx = await getTenantCtx(slug);
  return tenantTx(ctx.tenant.id, (tx) => uniqueProductSlug(tx, ctx.tenant.id, name || "product", excludeId));
}

export async function archiveProductAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบสินค้า" };
  const done = await tenantTx(ctx.tenant.id, (tx) => archiveProduct(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบสินค้า" };
  revalidateProducts(slug, id);
  return { ok: true, message: "เก็บสินค้าเข้าคลังถาวรแล้ว (ไม่แสดงบนหน้าร้าน)" };
}

export async function bulkProductStatusAction(slug: string, ids: string[], status: "active" | "draft" | "archived"): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const clean = ids.filter(isUuid).slice(0, 200);
  if (!clean.length) return { ok: false, error: "กรุณาเลือกสินค้า" };
  const n = await tenantTx(ctx.tenant.id, (tx) => setProductsStatus(tx, ctx.tenant.id, clean, status, actorOf(ctx)));
  revalidateProducts(slug);
  const label = status === "active" ? "เผยแพร่" : status === "draft" ? "ซ่อน" : "เก็บถาวร";
  return { ok: true, message: `${label} ${n} รายการแล้ว` };
}

export async function toggleFeaturedAction(slug: string, id: string, featured: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบสินค้า" };
  await tenantTx(ctx.tenant.id, (tx) => setProductFeatured(tx, ctx.tenant.id, id, featured));
  revalidateProducts(slug, id);
  return { ok: true, message: featured ? "ปักหมุดเป็นสินค้าแนะนำแล้ว" : "เอาออกจากสินค้าแนะนำแล้ว" };
}

/** In dev the admin and storefront are separate Next apps; local uploads must land in the storefront's public dir to be served. */
function pointLocalStorageAtWeb() {
  if (process.env.R2_BUCKET || process.env.LOCAL_UPLOAD_DIR) return;
  const webDir = path.resolve(process.cwd(), "../web/public/uploads");
  if (existsSync(path.dirname(webDir))) process.env.LOCAL_UPLOAD_DIR = webDir;
}

export async function uploadProductImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string; mediaId: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกรูปภาพ" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  // trust the bytes, not the declared type / file name (payments-api.md section 7): no SVG / HTML disguised as an image
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const folder = String(fd.get("folder") ?? "products").replace(/[^a-z0-9-]/gi, "") || "products";
  pointLocalStorageAtWeb();
  const key = objectKey(ctx.tenant.id, folder, `image.${sniffed.ext}`);
  const stored = await getStorage().put(key, buf, sniffed.mime);
  const [row] = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .insert(media)
      .values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: stored.mime, size: stored.size, folder: `/${folder}`, alt: file.name.replace(/\.[^.]+$/, ""), createdBy: ctx.userId })
      .returning({ id: media.id }),
  );
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url, mediaId: row!.id } };
}

export async function saveCategoryAction(slug: string, id: string | null, input: CategoryInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบหมวดหมู่" };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveCategory(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidateProducts(slug);
  return { ok: true, message: id ? "บันทึกหมวดหมู่แล้ว" : "สร้างหมวดหมู่แล้ว", data: r.value };
}

export async function quickCreateCategoryAction(slug: string, name: string): Promise<FormResult<{ id: string; name: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const clean = name.trim().slice(0, 100);
  if (!clean) return { ok: false, error: "กรุณากรอกชื่อหมวดหมู่" };
  const r = await tenantTx(ctx.tenant.id, async (tx) => {
    let base = slugify(clean);
    let s = base;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await saveCategory(tx, ctx.tenant.id, null, { name: clean, slug: s, description: null, image: null, parentId: null, sort: 0 }, actorOf(ctx));
      if (res.ok || res.code !== "slug") return res;
      s = `${base}-${n++}`;
      if (n > 50) return res;
    }
  });
  if (!r.ok) return { ok: false, error: r.error.message };
  revalidateProducts(slug);
  return { ok: true, message: `สร้างหมวดหมู่ "${clean}" แล้ว`, data: { id: r.value.id, name: clean } };
}

export async function deleteCategoryAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหมวดหมู่" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteCategory(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateProducts(slug);
  return { ok: true, message: r.value.detached > 0 ? `ลบหมวดหมู่แล้ว (สินค้า ${r.value.detached} รายการไม่มีหมวดหมู่)` : "ลบหมวดหมู่แล้ว" };
}
