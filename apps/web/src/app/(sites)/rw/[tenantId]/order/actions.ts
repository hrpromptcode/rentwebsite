"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolvePromptpayId } from "@rentweb/core/payments";
import { CART_COOKIE, cartSchema, createOrder, parseHours, pickupSlots, restaurantConfigOf, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import type { PickupState } from "@rentweb/module-restaurant/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const schema = z.object({
  items: z.string().min(2),
  name: z.string().trim().min(1, "กรุณากรอกชื่อผู้รับ").max(80),
  phone: z.string().trim().min(9, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง").max(20),
  scheduledFor: z.string().min(1, "กรุณาเลือกเวลารับอาหาร"),
  paymentMethod: z.enum(["promptpay_qr", "slip", "cash"]),
  note: z.string().trim().max(300).optional(),
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Bound by /order to tenantId. Places a pickup order and redirects to the tracker (phone in `?p=` as the proof). */
export async function placePickupOrder(tenantId: string, _prev: PickupState, fd: FormData): Promise<PickupState> {
  const values = { name: str(fd.get("name")), phone: str(fd.get("phone")), note: str(fd.get("note")) };
  const parsed = schema.safeParse({ items: fd.get("items"), name: values.name, phone: values.phone, scheduledFor: fd.get("scheduledFor"), paymentMethod: fd.get("paymentMethod"), note: values.note || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", values };

  let raw: unknown;
  try {
    raw = JSON.parse(parsed.data.items);
  } catch {
    return { error: "ข้อมูลออเดอร์ไม่ถูกต้อง ลองใหม่อีกครั้ง", values };
  }
  const cart = cartSchema.safeParse(raw);
  if (!cart.success || cart.data.length === 0) return { error: "ยังไม่มีรายการในออเดอร์", values };

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return { error: "ไม่พบร้านค้า", values };
  const cfg = restaurantConfigOf(runtime.config);
  if (!cfg.pickup) return { error: "ร้านปิดรับออเดอร์สั่งกลับบ้านชั่วคราว", values };
  const settings = runtime.config.settings;
  const contact = (settings.contact as { hours?: Array<{ day?: string; time?: string }> } | undefined) ?? {};

  // the slot must still be one we would offer right now (inside hours, ≥ lead time)
  const slots = pickupSlots({ hours: parseHours(contact.hours), leadMinutes: cfg.pickupLeadMinutes, stepMinutes: 15 });
  if (!slots.some((s) => s.value === parsed.data.scheduledFor)) return { error: "ช่วงเวลารับอาหารนี้ไม่เปิดแล้ว กรุณาเลือกเวลาใหม่", values };
  const methods = restaurantPaymentOptions(settings, "pickup");
  if (!methods.some((m) => m.value === parsed.data.paymentMethod)) return { error: "วิธีชำระเงินนี้ไม่เปิดใช้งาน", values };

  const customer = await getCurrentCustomer(tenantId);
  const result = await tenantTx(tenantId, (tx) =>
    createOrder(tx, tenantId, {
      type: "pickup",
      items: cart.data,
      contact: { name: parsed.data.name, phone: parsed.data.phone },
      customerId: customer?.id ?? null,
      scheduledFor: new Date(parsed.data.scheduledFor),
      paymentMethod: parsed.data.paymentMethod,
      promptpayId: resolvePromptpayId(settings),
      note: parsed.data.note ?? null,
      serviceChargePercent: 0,
    }),
  );
  if (!result.ok) return { error: result.error, values };

  const jar = await cookies();
  jar.set(CART_COOKIE, "", { maxAge: 0, path: "/" });
  const phone = result.value.order.customerPhone ?? parsed.data.phone;
  redirect(`/orders/r/${encodeURIComponent(result.value.order.number)}?p=${encodeURIComponent(phone)}`);
}
