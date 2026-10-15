"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { resolvePromptpayId } from "@rentweb/core/payments";
import { bangkokDate, createReservation, parseHours, reservationSlots, restaurantConfigOf, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import type { ReserveState } from "@rentweb/module-restaurant/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "กรุณาเลือกวันที่"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "กรุณาเลือกเวลา"),
  partySize: z.coerce.number().int().min(1, "จำนวนคนต้องอย่างน้อย 1").max(40, "จำนวนคนสูงสุด 40"),
  zone: z.string().trim().max(40).optional(),
  occasion: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["promptpay_qr", "slip"]).optional(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(80),
  phone: z.string().trim().min(9, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง").max(20),
  note: z.string().trim().max(300).optional(),
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Bound by /reserve to tenantId. Creates the reservation (+ deposit payment) and redirects to its page. */
export async function createReservationAction(tenantId: string, _prev: ReserveState, fd: FormData): Promise<ReserveState> {
  const values = { name: str(fd.get("name")), phone: str(fd.get("phone")), note: str(fd.get("note")) };
  const parsed = schema.safeParse({
    date: fd.get("date"),
    time: fd.get("time"),
    partySize: fd.get("partySize"),
    zone: str(fd.get("zone")) || undefined,
    occasion: str(fd.get("occasion")) || undefined,
    paymentMethod: str(fd.get("paymentMethod")) || undefined,
    name: values.name,
    phone: values.phone,
    note: values.note || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", values };

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return { error: "ไม่พบร้านค้า", values };
  const cfg = restaurantConfigOf(runtime.config);
  const settings = runtime.config.settings;
  const contact = (settings.contact as { hours?: Array<{ day?: string; time?: string }> } | undefined) ?? {};
  const now = new Date();
  const slots = reservationSlots({ hours: parseHours(contact.hours), ymd: parsed.data.date, now, durationMinutes: cfg.reservationMinutes });
  if (!slots.includes(parsed.data.time)) return { error: "รอบเวลานี้ไม่เปิดให้จองแล้ว กรุณาเลือกเวลาใหม่", values };

  const deposit = cfg.reservationDeposit;
  let method = parsed.data.paymentMethod ?? null;
  if (deposit > 0) {
    const methods = restaurantPaymentOptions(settings, "reservation");
    if (!method || !methods.some((m) => m.value === method)) method = (methods[0]?.value as "promptpay_qr" | "slip" | undefined) ?? null;
    if (!method) return { error: "ร้านยังไม่ได้ตั้งค่าวิธีรับมัดจำ กรุณาโทรจอง", values };
  }

  const customer = await getCurrentCustomer(tenantId);
  const result = await tenantTx(tenantId, (tx) =>
    createReservation(tx, tenantId, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      partySize: parsed.data.partySize,
      startsAt: bangkokDate(parsed.data.date, parsed.data.time),
      zone: parsed.data.zone ?? null,
      occasion: parsed.data.occasion ?? null,
      note: parsed.data.note ?? null,
      customerId: customer?.id ?? null,
      depositAmount: deposit,
      paymentMethod: deposit > 0 ? method : null,
      promptpayId: resolvePromptpayId(settings),
      durationMinutes: cfg.reservationMinutes,
      now,
    }),
  );
  if (!result.ok) return { error: result.error, values };

  const phone = result.value.reservation.phone;
  redirect(`/reservations/${encodeURIComponent(result.value.reservation.number)}?p=${encodeURIComponent(phone)}`);
}
