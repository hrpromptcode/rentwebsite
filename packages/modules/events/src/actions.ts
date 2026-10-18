"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { getTenantRuntime } from "@rentweb/core/tenant";
import { CUSTOMER_COOKIE, getCustomerByToken } from "@rentweb/core/customer";
import { isUuid, normalizeThaiPhone } from "@rentweb/core";
import { eventsConfig } from "./services/config";
import { cancelUnpaidOrder, createTicketOrder, getOrderForCustomer, renewOrderPayment, type TicketPaymentMethod } from "./services/orders";
import { L } from "./labels";

/**
 * Server actions used by the storefront buy widget and the order page. The tenant comes from the proxy header, the
 * customer from the storefront cookie, so the same actions work wherever the widget is embedded.
 */

const createSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.uuid().nullable().optional(),
  lines: z.array(z.object({ ticketTypeId: z.uuid(), qty: z.number().int().min(1).max(50) })).min(1).max(20),
  holders: z.array(z.object({ ticketTypeId: z.uuid(), name: z.string().trim().min(1).max(120), email: z.string().trim().max(200).nullable().optional() })).max(100).default([]),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  promoCode: z.string().trim().max(32).nullable().optional(),
  paymentMethod: z.enum(["promptpay_qr", "slip"]).nullable().optional(),
  terms: z.boolean(),
});

export type CreateTicketOrderPayload = z.input<typeof createSchema>;
export type TicketActionResult = { error: string } | { ok: true };

const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function tenantFromRequest() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return null;
  const runtime = await getTenantRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) return null;
  return { tenantId, runtime };
}

async function currentCustomerId(tenantId: string) {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  return withTenant(getDb(), tenantId, async (tx) => (await getCustomerByToken(tx, tenantId, token))?.id ?? null);
}

function revalidateOrder(tenantId: string, orderId: string) {
  revalidatePath(`/rw/${tenantId}/tickets/${orderId}`);
  revalidatePath(`/rw/${tenantId}/account/tickets`);
}

/** Buy widget submit: quote → createTicketOrder (locks, hold, payment) → redirect to /tickets/[id]?k=. */
export async function createTicketOrderAction(raw: unknown): Promise<TicketActionResult> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: msg("invalid_input") };
  if (!parsed.data.terms) return { error: msg("terms") };
  const t = await tenantFromRequest();
  if (!t) return { error: msg("unknown") };
  const { tenantId, runtime } = t;
  const d = parsed.data;
  const phone = d.phone?.trim() ? normalizeThaiPhone(d.phone) : null;
  if (d.phone?.trim() && !phone) return { error: msg("invalid_phone") };
  const email = d.email?.trim() || null;
  if (email && !EMAIL_RE.test(email)) return { error: msg("invalid_input") };
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;

  const result = await withTenant(getDb(), tenantId, async (tx) => {
    const customer = await getCustomerByToken(tx, tenantId, token);
    if (!customer && !phone && !email) return { ok: false as const, error: "invalid_customer" as const };
    return createTicketOrder(
      tx,
      tenantId,
      {
        eventId: d.eventId,
        sessionId: d.sessionId ?? null,
        lines: d.lines,
        promoCode: d.promoCode?.trim() || null,
        customer: { id: customer?.id ?? null, name: d.name, phone: phone ?? customer?.phone ?? null, email: email ?? customer?.email ?? null },
        holders: d.holders.map((h) => ({ ticketTypeId: h.ticketTypeId, name: h.name, email: h.email?.trim() || null })),
        note: d.note?.trim() || null,
        paymentMethod: d.paymentMethod ?? null,
        source: "online",
      },
      { config: eventsConfig(runtime.config.moduleConfig), settings: runtime.config.settings },
    );
  });
  if (!result.ok) return { error: msg(result.error) };
  revalidatePath(`/rw/${tenantId}/account/tickets`);
  redirect(`/tickets/${result.value.order.id}?k=${encodeURIComponent(result.value.accessKey)}`);
}

/** Owner / key holder cancels a pending order: the reservation is released at once. */
export async function cancelTicketOrderAction(input: { orderId: string; key?: string | null }): Promise<TicketActionResult> {
  if (!isUuid(input.orderId)) return { error: msg("not_found") };
  const t = await tenantFromRequest();
  if (!t) return { error: msg("unknown") };
  const { tenantId } = t;
  const customerId = await currentCustomerId(tenantId);
  const result = await withTenant(getDb(), tenantId, async (tx) => {
    const detail = await getOrderForCustomer(tx, tenantId, input.orderId, { customerId, key: input.key ?? null });
    if (!detail) return { ok: false as const, error: "not_found" as const };
    return cancelUnpaidOrder(tx, tenantId, input.orderId, { by: "customer" });
  });
  if (!result.ok) return { error: msg(result.error) };
  revalidateOrder(tenantId, input.orderId);
  return { ok: true };
}

/** New payment (fresh QR / slip) for a pending order whose payment expired or was rejected. */
export async function renewTicketPaymentAction(input: { orderId: string; key?: string | null; method?: TicketPaymentMethod | null }): Promise<TicketActionResult> {
  if (!isUuid(input.orderId)) return { error: msg("not_found") };
  const t = await tenantFromRequest();
  if (!t) return { error: msg("unknown") };
  const { tenantId, runtime } = t;
  const customerId = await currentCustomerId(tenantId);
  const result = await withTenant(getDb(), tenantId, async (tx) => {
    const detail = await getOrderForCustomer(tx, tenantId, input.orderId, { customerId, key: input.key ?? null });
    if (!detail) return { ok: false as const, error: "not_found" as const };
    const method = input.method ?? ((detail.payment?.method === "slip" || detail.payment?.method === "promptpay_qr" ? detail.payment.method : null) as TicketPaymentMethod | null);
    return renewOrderPayment(tx, tenantId, input.orderId, method, { config: eventsConfig(runtime.config.moduleConfig), settings: runtime.config.settings });
  });
  if (!result.ok) return { error: msg(result.error) };
  revalidateOrder(tenantId, input.orderId);
  return { ok: true };
}
