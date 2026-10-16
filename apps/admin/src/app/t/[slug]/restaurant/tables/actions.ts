"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteTable, regenerateTableQr, saveTable } from "@rentweb/module-restaurant/admin";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

export type FormResult = ActionResult & { fieldErrors?: Record<string, string> };
const uuid = z.string().uuid();

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/restaurant/tables`, "layout");
  revalidatePath(`/t/${slug}/restaurant/orders`);
}

const tableSchema = z.object({
  id: uuid.nullable().optional(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อโต๊ะ").max(30, "ชื่อยาวเกินไป"),
  zone: z.string().trim().max(40, "ชื่อโซนยาวเกินไป").nullable().optional(),
  seats: z.number().int("ต้องเป็นจำนวนเต็ม").min(1, "อย่างน้อย 1 ที่นั่ง").max(50, "ไม่เกิน 50 ที่นั่ง"),
  active: z.boolean(),
});
export type TableInput = z.input<typeof tableSchema>;

export async function saveTableAction(slug: string, input: TableInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
    return { ok: false, error: "กรุณาตรวจสอบข้อมูล", fieldErrors };
  }
  const r = await tenantTx(ctx.tenant.id, (tx) => saveTable(tx, ctx.tenant.id, parsed.data));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.code === "duplicate" ? { name: r.error } : undefined };
  revalidate(slug);
  return { ok: true, message: parsed.data.id ? "บันทึกโต๊ะแล้ว" : `เพิ่มโต๊ะ ${parsed.data.name} แล้ว`, data: r.value };
}

export async function deleteTableAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteTable(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "table.delete", targetType: "dining_table", targetId: id });
  revalidate(slug);
  return { ok: true, message: "ลบโต๊ะแล้ว" };
}

/** New QR token: the printed QR for this table stops working immediately. */
export async function regenerateQrAction(slug: string, id: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!uuid.safeParse(id).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => regenerateTableQr(tx, ctx.tenant.id, id));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "table.qr_regenerate", targetType: "dining_table", targetId: id });
  revalidate(slug);
  return { ok: true, message: "สร้าง QR ใหม่แล้ว อย่าลืมพิมพ์ป้ายใหม่", data: r.value };
}
