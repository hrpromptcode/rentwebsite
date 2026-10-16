"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { deleteDiscount, saveDiscount, setDiscountActive, type Actor } from "@rentweb/module-commerce/admin";
import { discountSchema, fieldErrors, type DiscountInput, type FormResult } from "@rentweb/module-commerce/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export async function saveDiscountAction(slug: string, id: string | null, input: DiscountInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบคูปอง" };
  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveDiscount(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidatePath(`/t/${slug}/discounts`);
  if (id) revalidatePath(`/t/${slug}/discounts/${id}`);
  return { ok: true, message: id ? "บันทึกคูปองแล้ว" : `สร้างคูปอง ${parsed.data.code} แล้ว`, data: r.value };
}

export async function toggleDiscountAction(slug: string, id: string, active: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบคูปอง" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setDiscountActive(tx, ctx.tenant.id, id, active));
  if (!done) return { ok: false, error: "ไม่พบคูปอง" };
  revalidatePath(`/t/${slug}/discounts`);
  revalidatePath(`/t/${slug}/discounts/${id}`);
  return { ok: true, message: active ? "เปิดใช้คูปองแล้ว" : "ปิดใช้คูปองแล้ว" };
}

export async function deleteDiscountAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบคูปอง" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteDiscount(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบคูปอง" };
  revalidatePath(`/t/${slug}/discounts`);
  return { ok: true, message: "ลบคูปองแล้ว" };
}
