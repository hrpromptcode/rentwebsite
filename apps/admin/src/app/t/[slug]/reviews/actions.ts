"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { deleteReview, replyReview, setReviewStatus, type Actor, type ReviewStatus } from "@rentweb/module-commerce/admin";
import { reviewReplySchema, type FormResult } from "@rentweb/module-commerce/admin/schemas";
import { assertRole, getTenantCtx, tenantTx, type TenantCtx } from "@/lib/tenant";

function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export async function setReviewStatusAction(slug: string, id: string, status: ReviewStatus): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id) || !["pending", "approved", "rejected"].includes(status)) return { ok: false, error: "ไม่พบรีวิว" };
  const r = await tenantTx(ctx.tenant.id, (tx) => setReviewStatus(tx, ctx.tenant.id, id, status, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/t/${slug}/reviews`);
  revalidatePath(`/t/${slug}/products`);
  return { ok: true, message: status === "approved" ? "อนุมัติรีวิวแล้ว แสดงบนหน้าร้านทันที" : status === "rejected" ? "ปฏิเสธรีวิวแล้ว" : "ย้ายกลับไปรอตรวจแล้ว" };
}

export async function replyReviewAction(slug: string, id: string, reply: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรีวิว" };
  const text = reply.trim();
  if (text) {
    const parsed = reviewReplySchema.safeParse({ reply: text });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อความไม่ถูกต้อง" };
  }
  const r = await tenantTx(ctx.tenant.id, (tx) => replyReview(tx, ctx.tenant.id, id, text || null, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/t/${slug}/reviews`);
  return { ok: true, message: text ? "บันทึกคำตอบแล้ว" : "ลบคำตอบแล้ว" };
}

export async function deleteReviewAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรีวิว" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteReview(tx, ctx.tenant.id, id, actorOf(ctx)));
  if (!done) return { ok: false, error: "ไม่พบรีวิว" };
  revalidatePath(`/t/${slug}/reviews`);
  return { ok: true, message: "ลบรีวิวแล้ว" };
}
