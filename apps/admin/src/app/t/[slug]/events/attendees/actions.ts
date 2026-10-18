"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { manualCheckIn, undoCheckIn } from "@rentweb/module-events/admin";
import { CHECKIN_REASON } from "@rentweb/module-events/admin/labels";
import type { FormResult } from "@rentweb/module-events/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/events/attendees`);
  revalidatePath(`/t/${slug}/events/checkin`);
  revalidatePath(`/t/${slug}/events`);
}

/** Manual check-in from the list (staff): day / time window is not enforced, every other rule is. */
export async function manualCheckInAction(slug: string, ticketId: string): Promise<FormResult<{ outcome: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(ticketId)) return { ok: false, error: "ไม่พบบัตร" };
  const r = await tenantTx(ctx.tenant.id, (tx) => manualCheckIn(tx, ctx.tenant.id, ticketId, ctx.userId));
  if (!r) return { ok: false, error: "ไม่พบบัตร" };
  revalidate(slug);
  if (r.outcome === "checked_in") return { ok: true, message: `เช็กอิน ${r.ticket.ticket.holderName} แล้ว`, data: { outcome: r.outcome } };
  if (r.outcome === "already_checked_in") return { ok: false, error: `${CHECKIN_REASON.already_checked_in!.label} — ${r.ticket.ticket.holderName}` };
  const m = CHECKIN_REASON[r.reason];
  return { ok: false, error: m ? `${m.label}: ${m.hint}` : r.reason };
}

export async function undoCheckInAction(slug: string, ticketId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(ticketId)) return { ok: false, error: "ไม่พบบัตร" };
  const row = await tenantTx(ctx.tenant.id, (tx) => undoCheckIn(tx, ctx.tenant.id, ticketId));
  if (!row) return { ok: false, error: "บัตรใบนี้ไม่ได้อยู่ในสถานะเช็กอินแล้ว" };
  revalidate(slug);
  return { ok: true, message: `ยกเลิกการเช็กอินของ ${row.holderName} แล้ว — บัตรใช้เข้างานได้อีกครั้ง` };
}
