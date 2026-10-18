"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { deleteRateRule, saveRateRule, setRateRuleActive } from "@rentweb/module-rental/admin";
import { fieldErrors, rateRuleSchema, type FormResult, type RateRuleInput } from "@rentweb/module-rental/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf } from "../_lib";

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/rental/rates`);
  revalidatePath(`/t/${slug}/rental/calendar`);
}

export async function saveRateRuleAction(slug: string, id: string | null, input: RateRuleInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบกฎราคา" };
  const parsed = rateRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => saveRateRule(tx, ctx.tenant.id, id, parsed.data, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error.message, fieldErrors: { [r.error.field]: r.error.message } };
  revalidate(slug);
  return { ok: true, message: id ? "บันทึกกฎราคาแล้ว" : "เพิ่มกฎราคาแล้ว", data: r.value };
}

export async function toggleRateRuleAction(slug: string, id: string, active: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบกฎราคา" };
  const done = await tenantTx(ctx.tenant.id, (tx) => setRateRuleActive(tx, ctx.tenant.id, id, active, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบกฎราคา" };
  revalidate(slug);
  return { ok: true, message: active ? "เปิดใช้กฎราคาแล้ว" : "ปิดกฎราคาแล้ว" };
}

export async function deleteRateRuleAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบกฎราคา" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteRateRule(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบกฎราคา" };
  revalidate(slug);
  return { ok: true, message: "ลบกฎราคาแล้ว" };
}
