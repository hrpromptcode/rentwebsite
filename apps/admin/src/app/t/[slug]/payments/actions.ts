"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { rejectPayment, verifyPayment, type Actor } from "@rentweb/module-commerce/admin";
import type { FormResult } from "@rentweb/module-commerce/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

function revalidateAll(slug: string) {
  for (const p of ["payments", "orders", "dashboard", "bookings", "topup/orders", "restaurant/orders", "restaurant/reservations"]) revalidatePath(`/t/${slug}/${p}`);
}

/** Approves a pending payment of any refType: markPaid runs the owning module's handler (order paid, booking confirmed, top-up fulfilled…). */
export async function approvePaymentAction(slug: string, paymentId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการชำระเงิน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => verifyPayment(tx, ctx.tenant.id, paymentId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateAll(slug);
  return { ok: true, message: "ยืนยันการชำระเงินแล้ว" };
}

export async function rejectPaymentQueueAction(slug: string, paymentId: string, reason: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(paymentId)) return { ok: false, error: "ไม่พบรายการชำระเงิน" };
  const text = reason.trim().slice(0, 300);
  if (!text) return { ok: false, error: "กรุณาระบุเหตุผล" };
  const r = await tenantTx(ctx.tenant.id, (tx) => rejectPayment(tx, ctx.tenant.id, paymentId, text, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateAll(slug);
  return { ok: true, message: "ปฏิเสธสลิปแล้ว" };
}
