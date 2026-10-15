"use server";

import { revalidatePath } from "next/cache";
import { cancelReservation, getReservationForCustomer } from "@rentweb/module-restaurant/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

/** Bound by the reservation page to (tenantId, number, phone). Guests may cancel their own pending/confirmed booking. */
export async function cancelReservationAction(tenantId: string, number: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return { ok: false, error: "ไม่พบร้านค้า" };
  const result = await tenantTx(tenantId, async (tx) => {
    const r = await getReservationForCustomer(tx, tenantId, number, phone);
    if (!r.ok) return r;
    if (r.value.reservation.startsAt.getTime() < Date.now()) return { ok: false as const, error: "เลยเวลาจองแล้ว ไม่สามารถยกเลิกได้" };
    return cancelReservation(tx, tenantId, r.value.reservation.id, "guest");
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/reservations/${number}`);
  return { ok: true };
}
