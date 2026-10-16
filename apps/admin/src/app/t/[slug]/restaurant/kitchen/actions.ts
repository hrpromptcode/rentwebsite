"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bumpTicket, completeTicket, setItemStatus, startTicket } from "@rentweb/module-restaurant/admin";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

const uuid = z.string().uuid();

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/restaurant/kitchen`);
  revalidatePath(`/t/${slug}/restaurant/orders`);
}

export async function setItemDoneAction(slug: string, itemId: string, done: boolean): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => setItemStatus(tx, ctx.tenant.id, itemId, done ? "done" : "cooking"));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: r.value.orderStatus === "ready" ? "ครบทุกรายการ ออเดอร์พร้อมเสิร์ฟ" : done ? "ทำเสร็จแล้ว" : "กลับไปกำลังทำ" };
}

export async function startTicketAction(slug: string, orderId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => startTicket(tx, ctx.tenant.id, orderId));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: `${r.value.number} เริ่มทำแล้ว` };
}

export async function completeTicketAction(slug: string, orderId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => completeTicket(tx, ctx.tenant.id, orderId));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: `${r.value.number} ${r.value.type === "pickup" ? "พร้อมรับ แจ้งลูกค้าแล้ว" : "พร้อมเสิร์ฟ"}` };
}

export async function bumpTicketAction(slug: string, orderId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, (tx) => bumpTicket(tx, ctx.tenant.id, orderId));
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(slug);
  return { ok: true, message: `${r.value.number} ${r.value.status === "served" ? "เสิร์ฟแล้ว" : "ส่งมอบแล้ว"}` };
}
