"use server";

import { isUuid } from "@rentweb/core";
import { addBlacklistEntry, removeBlacklistEntry } from "@rentweb/module-topup/admin";
import { blacklistSchema, fieldErrors, type BlacklistInput, type FormResult } from "@rentweb/module-topup/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf, revalidateTopup } from "../_shared";

export async function addBlacklistAction(slug: string, input: BlacklistInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = blacklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const r = await tenantTx(ctx.tenant.id, (tx) => addBlacklistEntry(tx, ctx.tenant.id, { kind: parsed.data.kind, value: parsed.data.value, reason: parsed.data.reason || null }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: { value: r.error } };
  revalidateTopup(slug, ["/topup/blacklist"]);
  return { ok: true, message: `บล็อก ${r.value.value} แล้ว — รายการใหม่ที่ตรงกันจะถูกปฏิเสธ`, data: { id: r.value.id } };
}

export async function removeBlacklistAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการ" };
  const r = await tenantTx(ctx.tenant.id, (tx) => removeBlacklistEntry(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, ["/topup/blacklist"]);
  return { ok: true, message: "ปลดบล็อกแล้ว" };
}
