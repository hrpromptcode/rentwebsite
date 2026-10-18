"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { getTenantRuntime } from "@rentweb/core/tenant";
import { CUSTOMER_COOKIE, getCustomerByToken } from "@rentweb/core/customer";
import { normalizeThaiPhone } from "@rentweb/core";
import { rentalConfig } from "./services/config";
import { createStay } from "./services/stays";
import { YMD_RE } from "./services/time";
import { L } from "./labels";

/**
 * Server action used by the book form (/stay/book). Tenant comes from the proxy header, the customer from the storefront
 * cookie – the same action works wherever the form is embedded. On success it redirects to the guest page (?k=).
 */

const payloadSchema = z.object({
  unitTypeId: z.uuid(),
  checkIn: z.string().regex(YMD_RE),
  checkOut: z.string().regex(YMD_RE),
  guests: z.number().int().min(1).max(50),
  extras: z.array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(20) })).max(20).default([]),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  paymentMethod: z.enum(["promptpay_qr", "slip", "cash"]).optional().nullable(),
  payOption: z.enum(["deposit", "full"]).optional().nullable(),
});

export type CreateStayPayload = z.input<typeof payloadSchema>;
export type StayActionResult = { error: string } | { ok: true; redirectTo: string };

const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";

async function tenantFromRequest() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return null;
  const runtime = await getTenantRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) return null;
  return { tenantId, runtime };
}

export async function createStayAction(raw: unknown): Promise<StayActionResult> {
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
    return createStay(
      tx,
      tenantId,
      {
        unitTypeId: parsed.data.unitTypeId,
        checkIn: parsed.data.checkIn,
        checkOut: parsed.data.checkOut,
        guests: parsed.data.guests,
        extras: parsed.data.extras,
        customer: { id: customer?.id ?? null, name: parsed.data.name, phone, email },
        note: parsed.data.note ?? null,
        paymentMethod: parsed.data.paymentMethod ?? null,
        payOption: parsed.data.payOption ?? null,
        source: "online",
      },
      { config: rentalConfig(runtime.config.moduleConfig), settings: runtime.config.settings },
    );
  });
  if (!result.ok) return { error: msg(result.error) };
  redirect(`/stays/${result.value.stay.id}?k=${encodeURIComponent(result.value.accessKey)}`);
}
