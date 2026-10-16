"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { deleteShippingMethod, saveShippingMethod, setShippingMethodActive, type Actor } from "@rentweb/module-commerce/admin";
import { fieldErrors, shippingMethodSchema, type FormResult, type ShippingMethodInput } from "@rentweb/module-commerce/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export async function saveShippingMethodAction(slug: string, id: string | null, input: ShippingMethodInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบวิธีจัดส่ง" };
  const parsed = shippingMethodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveShippingMethod(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  revalidatePath(`/t/${slug}/shipping`);
  if (id) revalidatePath(`/t/${slug}/shipping/${id}`);
  return { ok: true, message: id ? "บันทึกวิธีจัดส่งแล้ว" : "เพิ่มวิธีจัดส่งแล้ว", data: r };
}

export async function toggleShippingMethodAction(slug: string, id: string, active: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบวิธีจัดส่ง" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setShippingMethodActive(tx, ctx.tenant.id, id, active));
  if (!done) return { ok: false, error: "ไม่พบวิธีจัดส่ง" };
  revalidatePath(`/t/${slug}/shipping`);
  return { ok: true, message: active ? "เปิดใช้วิธีจัดส่งแล้ว" : "ปิดใช้วิธีจัดส่งแล้ว (ลูกค้าจะไม่เห็นตอนชำระเงิน)" };
}

export async function deleteShippingMethodAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบวิธีจัดส่ง" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteShippingMethod(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบวิธีจัดส่ง" };
  revalidatePath(`/t/${slug}/shipping`);
  return { ok: true, message: "ลบวิธีจัดส่งแล้ว" };
}
