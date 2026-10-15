"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { getTenantRuntime } from "@rentweb/core/tenant";
import { CUSTOMER_COOKIE, getCustomerByToken } from "@rentweb/core/customer";
import { normalizeThaiPhone } from "@rentweb/core";
import { bookingConfig } from "./services/config";
import { createBooking } from "./services/bookings";
import { L } from "./labels";

/**
 * Server action used by the booking wizard (section + /book page). Tenant comes from the proxy header,
 * the customer from the storefront cookie – so the same action works wherever the widget is embedded.
 */

const payloadSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable().optional(),
  start: z.iso.datetime(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  paymentMethod: z.enum(["promptpay_qr", "slip", "cash", "card", "cod", "wallet"]).optional().nullable(),
  partySize: z.number().int().min(1).max(20).optional(),
});

export type CreateBookingPayload = z.input<typeof payloadSchema>;
export type BookingActionResult = { error: string } | { ok: true; redirectTo: string };

const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";

async function tenantFromRequest() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return null;
  const runtime = await getTenantRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return null;
  return { tenantId, runtime };
}

export async function createBookingAction(raw: unknown): Promise<BookingActionResult> {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { error: msg("invalid_input") };
  const t = await tenantFromRequest();
  if (!t) return { error: msg("unknown") };
  const { tenantId, runtime } = t;
  const phone = normalizeThaiPhone(parsed.data.phone);
  if (!phone) return { error: msg("invalid_phone") };
  const email = parsed.data.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: msg("invalid_input") };
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;

  const result = await withTenant(getDb(), tenantId, async (tx) => {
    const customer = await getCustomerByToken(tx, tenantId, token);
    return createBooking(
      tx,
      tenantId,
      {
        serviceId: parsed.data.serviceId,
        staffId: parsed.data.staffId ?? null,
        start: parsed.data.start,
        customer: { id: customer?.id ?? null, name: parsed.data.name, phone, email },
        note: parsed.data.note ?? null,
        partySize: parsed.data.partySize ?? 1,
        paymentMethod: parsed.data.paymentMethod ?? null,
        source: "online",
      },
      { config: bookingConfig(runtime.config.moduleConfig), settings: runtime.config.settings },
    );
  });
  if (!result.ok) return { error: msg(result.error) };
  revalidatePath(`/rw/${tenantId}/account/bookings`);
  redirect(`/bookings/${result.value.booking.id}?k=${encodeURIComponent(result.value.accessKey)}`);
}
