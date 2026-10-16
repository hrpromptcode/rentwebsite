"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import { deleteCategory, deleteItem, deleteMenu, deleteModifier, deleteModifierGroup, reorderCategories, reorderItems, saveCategory, saveItem, saveMenu, saveModifier, saveModifierGroup, setItemFlag, STATIONS } from "@rentweb/module-restaurant/admin";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

export type FormResult = ActionResult & { fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/restaurant/menu`, "layout");
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "_");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

async function actor(slug: string, min: "staff" | "manager") {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, min);
  return ctx;
}

/* ────────────── menus (sets) ────────────── */

const menuSchema = z.object({ id: uuid.nullable().optional(), name: z.string().trim().min(1, "กรุณากรอกชื่อเมนู").max(80, "ชื่อยาวเกินไป"), active: z.boolean().default(true) });

export async function saveMenuAction(slug: string, input: z.input<typeof menuSchema>): Promise<FormResult> {
  const ctx = await actor(slug, "manager");
  const parsed = menuSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveMenu(tx, ctx.tenant.id, parsed.data));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: parsed.data.id ? "บันทึกเมนูแล้ว" : "สร้างเมนูแล้ว", data: r.value };
}

export async function deleteMenuAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteMenu(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "menu.delete", targetType: "menu", targetId: id });
  revalidate(slug);
  return { ok: true, message: "ลบเมนูแล้ว" };
}

/* ────────────── categories ────────────── */

const categorySchema = z.object({
  id: uuid.nullable().optional(),
  menuId: uuid,
  name: z.string().trim().min(1, "กรุณากรอกชื่อหมวด").max(80, "ชื่อยาวเกินไป"),
  nameEn: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

export async function saveCategoryAction(slug: string, input: z.input<typeof categorySchema>): Promise<FormResult> {
  const ctx = await actor(slug, "manager");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveCategory(tx, ctx.tenant.id, parsed.data));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: parsed.data.id ? "บันทึกหมวดแล้ว" : "เพิ่มหมวดแล้ว", data: r.value };
}

export async function deleteCategoryAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteCategory(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: "ลบหมวดแล้ว" };
}

export async function reorderCategoriesAction(slug: string, ids: string[]): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  await tenantTx(ctx.tenant.id, (tx) => reorderCategories(tx, ctx.tenant.id, parsed.data));
  revalidate(slug);
  return { ok: true, message: "จัดลำดับแล้ว" };
}

/* ────────────── items ────────────── */

const itemSchema = z.object({
  id: uuid.nullable().optional(),
  categoryId: uuid,
  name: z.string().trim().min(1, "กรุณากรอกชื่อเมนู").max(120, "ชื่อยาวเกินไป"),
  nameEn: z.string().trim().max(120, "ชื่อยาวเกินไป").nullable().optional(),
  description: z.string().trim().max(1000, "คำอธิบายยาวเกินไป").nullable().optional(),
  image: z.string().trim().max(1000).nullable().optional(),
  /** baht, may have decimals */
  price: z.number().min(0, "ราคาต้องไม่ติดลบ").max(1_000_000, "ราคาสูงเกินไป"),
  compareAtPrice: z.number().min(0).max(1_000_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10, "แท็กได้สูงสุด 10 รายการ"),
  allergens: z.array(z.string().trim().min(1).max(30)).max(15),
  spicyLevel: z.number().int().min(0).max(5),
  prepMinutes: z.number().int().min(0).max(240, "ไม่เกิน 240 นาที").nullable().optional(),
  station: z.enum(STATIONS),
  available: z.boolean(),
  soldOut: z.boolean(),
  featured: z.boolean(),
  sort: z.number().int().min(0).max(9999).optional(),
  modifierGroupIds: z.array(uuid).max(10, "เลือกกลุ่มตัวเลือกได้สูงสุด 10 กลุ่ม"),
});
export type ItemInput = z.input<typeof itemSchema>;

export async function saveItemAction(slug: string, input: ItemInput): Promise<FormResult> {
  const ctx = await actor(slug, "manager");
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.compareAtPrice && d.compareAtPrice <= d.price) return { ok: false, error: "ราคาก่อนลดต้องมากกว่าราคาขาย", fieldErrors: { compareAtPrice: "ต้องมากกว่าราคาขาย" } };
  const r = await tenantTx(ctx.tenant.id, (tx) =>
    saveItem(tx, ctx.tenant.id, {
      ...d,
      price: Math.round(d.price * 100),
      compareAtPrice: d.compareAtPrice ? Math.round(d.compareAtPrice * 100) : null,
      prepMinutes: d.prepMinutes ?? null,
    }),
  );
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: d.id ? "menu_item.update" : "menu_item.create", targetType: "menu_item", targetId: r.value.id, diff: { name: d.name, price: Math.round(d.price * 100) } });
  revalidate(slug);
  return { ok: true, message: d.id ? "บันทึกเมนูแล้ว" : "เพิ่มเมนูแล้ว", data: r.value };
}

export async function deleteItemAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteItem(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "menu_item.delete", targetType: "menu_item", targetId: id });
  revalidate(slug);
  return { ok: true, message: "ลบเมนูแล้ว" };
}

/** Quick toggles from the list: staff may flip sold-out/available (daily ops). */
export async function setItemFlagAction(slug: string, id: string, flag: "available" | "soldOut" | "featured", value: boolean): Promise<ActionResult> {
  const ctx = await actor(slug, "staff");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => setItemFlag(tx, ctx.tenant.id, id, flag, value));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  const msg = flag === "soldOut" ? (value ? "ตั้งเป็นหมดชั่วคราวแล้ว" : "เปิดขายอีกครั้งแล้ว") : flag === "available" ? (value ? "แสดงบนเมนูแล้ว" : "ซ่อนจากเมนูแล้ว") : value ? "ตั้งเป็นเมนูแนะนำแล้ว" : "เอาออกจากเมนูแนะนำแล้ว";
  return { ok: true, message: msg };
}

export async function reorderItemsAction(slug: string, ids: string[]): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  const parsed = z.array(uuid).min(1).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  await tenantTx(ctx.tenant.id, (tx) => reorderItems(tx, ctx.tenant.id, parsed.data));
  revalidate(slug);
  return { ok: true, message: "จัดลำดับแล้ว" };
}

/** Uploads a menu image; returns an absolute URL usable by both the admin and the storefront. */
export async function uploadItemImageAction(slug: string, fd: FormData): Promise<ActionResult & { url?: string }> {
  const ctx = await actor(slug, "manager");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  // trust the bytes, not the client's file.type / file.name: only real raster images, stored with their sniffed type
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const stored = await getStorage().put(objectKey(ctx.tenant.id, "menu", `menu.${sniffed.ext}`), buf, sniffed.mime);
  // local uploads are served by the storefront (AC-01), so absolute URLs point at WEB_URL like assetUrl()
  const url = stored.url.startsWith("/") ? `${(process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")}${stored.url}` : stored.url;
  return { ok: true, message: "อัปโหลดรูปแล้ว", url };
}

/* ────────────── modifier groups ────────────── */

const groupSchema = z.object({
  id: uuid.nullable().optional(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อกลุ่ม").max(80, "ชื่อยาวเกินไป"),
  minSelect: z.number().int().min(0).max(20),
  maxSelect: z.number().int().min(1, "อย่างน้อย 1").max(20),
  required: z.boolean(),
});
export type GroupInput = z.input<typeof groupSchema>;

export async function saveModifierGroupAction(slug: string, input: GroupInput): Promise<FormResult> {
  const ctx = await actor(slug, "manager");
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveModifierGroup(tx, ctx.tenant.id, parsed.data));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: parsed.data.id ? "บันทึกกลุ่มแล้ว" : "เพิ่มกลุ่มแล้ว", data: r.value };
}

export async function deleteModifierGroupAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteModifierGroup(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: "ลบกลุ่มตัวเลือกแล้ว" };
}

const modifierSchema = z.object({
  id: uuid.nullable().optional(),
  groupId: uuid,
  name: z.string().trim().min(1, "กรุณากรอกชื่อตัวเลือก").max(80, "ชื่อยาวเกินไป"),
  /** baht */
  priceDelta: z.number().min(-100_000).max(100_000),
  available: z.boolean(),
});
export type ModifierInput = z.input<typeof modifierSchema>;

export async function saveModifierAction(slug: string, input: ModifierInput): Promise<FormResult> {
  const ctx = await actor(slug, "manager");
  const parsed = modifierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveModifier(tx, ctx.tenant.id, { ...parsed.data, priceDelta: Math.round(parsed.data.priceDelta * 100) }));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: parsed.data.id ? "บันทึกตัวเลือกแล้ว" : "เพิ่มตัวเลือกแล้ว", data: r.value };
}

export async function deleteModifierAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await actor(slug, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteModifier(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: "ลบตัวเลือกแล้ว" };
}
