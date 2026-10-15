"use server";

import { z } from "zod";
import { fail } from "@rentweb/core";
import { cartSchema, createOrder, getSessionByToken, isSessionOpen, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import type { DineInResult } from "@rentweb/module-restaurant/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const schema = z.object({ items: z.string().min(2), guestName: z.string().trim().max(40).optional() });

/** Bound by the table page to (tenantId, sessionToken). Creates one dine-in "round" for the open table session. */
export async function submitDineInOrder(tenantId: string, sessionToken: string, fd: FormData): Promise<DineInResult> {
  const parsed = schema.safeParse({ items: fd.get("items"), guestName: fd.get("guestName") || undefined });
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง ลองใหม่อีกครั้ง" };
  let raw: unknown;
  try {
    raw = JSON.parse(parsed.data.items);
  } catch {
    return { ok: false, error: "ข้อมูลไม่ถูกต้อง ลองใหม่อีกครั้ง" };
  }
  const cart = cartSchema.safeParse(raw);
  if (!cart.success || cart.data.length === 0) return { ok: false, error: "ยังไม่มีรายการในออเดอร์" };

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return { ok: false, error: "ไม่พบร้านค้า" };
  const cfg = restaurantConfigOf(runtime.config);
  if (!cfg.dineIn) return { ok: false, error: "ร้านปิดรับออเดอร์ที่โต๊ะชั่วคราว กรุณาสั่งกับพนักงาน" };
  const customer = await getCurrentCustomer(tenantId);

  const result = await tenantTx(tenantId, async (tx) => {
    const session = await getSessionByToken(tx, tenantId, sessionToken);
    if (!session || !isSessionOpen(session)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว กรุณาสแกน QR ที่โต๊ะอีกครั้ง", "session_closed");
    return createOrder(tx, tenantId, {
      type: "dine_in",
      sessionId: session.id,
      items: cart.data,
      guestLabel: parsed.data.guestName ?? null,
      customerId: customer?.id ?? null,
      serviceChargePercent: cfg.serviceChargePercent,
    });
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, number: result.value.order.number, total: result.value.order.total };
}
