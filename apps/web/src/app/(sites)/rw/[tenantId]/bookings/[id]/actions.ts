"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import type { PaymentMethod } from "@rentweb/core/payments";
import { bookingConfig, cancelBooking, createBookingPayment, getBookingForCustomer, rescheduleBooking } from "@rentweb/module-booking/services";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

export type BookingActionState = { error?: string; ok?: boolean };

const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";
const keyQs = (key: string | null) => (key ? `?k=${encodeURIComponent(key)}` : "");

/** Loads tenant + booking only when the caller is the owner or holds the access key. */
async function authorise(tenantId: string, bookingId: string, key: string | null) {
  if (!isUuid(bookingId)) return null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return null;
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getBookingForCustomer(tx, tenantId, bookingId, { customerId: customer?.id, key }));
  if (!detail) return null;
  return { runtime, detail, config: bookingConfig(runtime.config.moduleConfig) };
}

function revalidate(tenantId: string, bookingId: string) {
  revalidatePath(`/rw/${tenantId}/bookings/${bookingId}`);
  revalidatePath(`/rw/${tenantId}/account/bookings`);
}

/** Customer cancels under the cancelHours policy. Bound as (tenantId, bookingId, key) → useActionState. */
export async function cancelBookingAction(tenantId: string, bookingId: string, key: string | null, _prev: BookingActionState, form: FormData): Promise<BookingActionState> {
  const auth = await authorise(tenantId, bookingId, key);
  if (!auth) return { error: msg("not_found") };
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  const result = await tenantTx(tenantId, (tx) => cancelBooking(tx, tenantId, bookingId, { by: "customer", reason, config: auth.config }));
  if (!result.ok) return { error: msg(result.error) };
  revalidate(tenantId, bookingId);
  redirect(`/bookings/${bookingId}${keyQs(key)}`);
}

/** Customer moves the appointment: old booking cancelled, new one created (same payment state). */
export async function rescheduleBookingAction(tenantId: string, bookingId: string, key: string | null, start: string): Promise<{ error: string } | void> {
  if (typeof start !== "string" || Number.isNaN(Date.parse(start))) return { error: msg("invalid_slot") };
  const auth = await authorise(tenantId, bookingId, key);
  if (!auth) return { error: msg("not_found") };
  const result = await tenantTx(tenantId, (tx) => rescheduleBooking(tx, tenantId, bookingId, { start, by: "customer" }, { config: auth.config, settings: auth.runtime.config.settings }));
  if (!result.ok) return { error: msg(result.error) };
  revalidate(tenantId, bookingId);
  redirect(`/bookings/${result.value.booking.id}?k=${encodeURIComponent(result.value.accessKey)}`);
}

/** Re-issues the deposit payment (new QR) when the previous one expired. */
export async function renewPaymentAction(tenantId: string, bookingId: string, key: string | null): Promise<void> {
  const auth = await authorise(tenantId, bookingId, key);
  if (!auth) return;
  const { booking, payment } = auth.detail;
  if (booking.status !== "pending" || booking.depositAmount <= 0 || payment?.status === "paid") return;
  await tenantTx(tenantId, (tx) => createBookingPayment(tx, tenantId, booking, (payment?.method as PaymentMethod | undefined) ?? null, auth.runtime.config.settings));
  revalidate(tenantId, bookingId);
  redirect(`/bookings/${bookingId}${keyQs(key)}`);
}
