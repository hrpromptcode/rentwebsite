"use server";

import { isUuid } from "@rentweb/core";
import { deleteSupplier, upsertSupplier } from "@rentweb/module-topup/admin";
import { fieldErrors, supplierSchema, type FormResult, type SupplierInput } from "@rentweb/module-topup/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf, revalidateTopup } from "../_shared";

const SECRET_KEY = /(secret|password|passwd|token|api[_-]?key|private)/i;

export async function saveSupplierAction(slug: string, input: SupplierInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.id && !isUuid(parsed.data.id)) return { ok: false, error: "ไม่พบ supplier" };
  const secret = Object.keys(parsed.data.config).find((k) => SECRET_KEY.test(k));
  if (secret) return { ok: false, error: `config ห้ามมีความลับ (“${secret}”) เพราะไม่ได้เข้ารหัส`, fieldErrors: { config: `ลบคีย์ “${secret}” ออก — API key / รหัสผ่านให้ผู้ดูแลระบบตั้งเป็นความลับของร้านแทน` } };
  const r = await tenantTx(ctx.tenant.id, (tx) => upsertSupplier(tx, ctx.tenant.id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, ["/topup/suppliers", "/topup/games"]);
  return { ok: true, message: parsed.data.id ? `บันทึก “${r.value.name}” แล้ว` : `เพิ่ม supplier “${r.value.name}” แล้ว`, data: { id: r.value.id } };
}

export async function deleteSupplierAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบ supplier" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteSupplier(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, ["/topup/suppliers"]);
  return { ok: true, message: "ลบ supplier แล้ว" };
}
