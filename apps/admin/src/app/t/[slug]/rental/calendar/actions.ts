"use server";

import { revalidatePath } from "next/cache";
import { setBlockedDates } from "@rentweb/module-rental/admin";
import { blockSchema, fieldErrors, type BlockInput, type FormResult } from "@rentweb/module-rental/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf } from "../_lib";

/** Block / unblock an inclusive date range for one unit type (maintenance, owner use). */
export async function setBlockedAction(slug: string, input: BlockInput): Promise<FormResult<{ changed: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const r = await tenantTx(ctx.tenant.id, (tx) => setBlockedDates(tx, ctx.tenant.id, { unitTypeId: v.unitTypeId, from: v.from, to: v.to, blocked: v.blocked, reason: v.reason }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/t/${slug}/rental/calendar`);
  return { ok: true, message: v.blocked ? `ปิดจอง ${r.value.changed} วันแล้ว` : `เปิดจองอีกครั้ง ${r.value.changed} วันแล้ว`, data: r.value };
}
