"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeThaiPhone } from "@rentweb/core";
import type { AddressJson } from "@rentweb/db";
import { createOrderFromCart, getShippingMethod, type CheckoutPaymentMethod } from "@rentweb/module-commerce/services";
import type { CheckoutState } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { isThaiProvince } from "@rentweb/module-commerce/lib";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { getCartToken } from "../cart/cookie";

const METHODS = ["promptpay_qr", "slip", "cod", "cash", "card"] as const satisfies readonly CheckoutPaymentMethod[];

const baseSchema = z.object({
  name: z.string().trim().min(1, L.errRequired).max(120, L.errRequired),
  phone: z
    .string()
    .trim()
    .min(9, L.errPhone)
    .max(20, L.errPhone)
    .refine((v) => !!normalizeThaiPhone(v), L.errPhone),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email(L.errEmail).max(160, L.errEmail)]).optional(),
  shippingMethodId: z.string().uuid(L.errShipping),
  paymentMethod: z.enum(METHODS, { message: L.errPayment }),
  note: z.string().trim().max(500).optional(),
});

const addressSchema = z.object({
  line1: z.string().trim().min(1, L.errRequired).max(200, L.errRequired),
  line2: z.string().trim().max(200).optional(),
  subdistrict: z.string().trim().min(1, L.errRequired).max(80),
  district: z.string().trim().min(1, L.errRequired).max(80),
  province: z.string().trim().refine(isThaiProvince, L.errRequired),
  postalCode: z.string().trim().regex(/^\d{5}$/, L.errPostal),
});

function fieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

const CODE_FIELD: Record<string, string> = { shipping: "shippingMethodId", shipping_unavailable: "shippingMethodId", cod_required: "paymentMethod", cod_not_allowed: "paymentMethod", address: "line1" };

/** Creates the order + payment from the visitor's cart, then redirects to the order page with its access key. */
export async function placeOrderAction(tenantId: string, _prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return { error: L.errGeneric };

  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;

  const base = baseSchema.safeParse(raw);
  if (!base.success) return { error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: fieldErrors(base.error.issues) };

  const [token, customer, method] = await Promise.all([getCartToken(), getCurrentCustomer(tenantId), tenantTx(tenantId, (tx) => getShippingMethod(tx, tenantId, base.data.shippingMethodId))]);
  if (!token) return { error: L.errCartEmpty };
  if (!method) return { error: L.errShipping, fieldErrors: { shippingMethodId: L.errShipping } };

  let address: AddressJson | null = null;
  if (method.type !== "pickup") {
    const a = addressSchema.safeParse(raw);
    if (!a.success) return { error: "กรุณาตรวจสอบที่อยู่จัดส่ง", fieldErrors: fieldErrors(a.error.issues) };
    const phone = normalizeThaiPhone(base.data.phone) ?? base.data.phone;
    address = { name: base.data.name, phone, line1: a.data.line1, line2: a.data.line2 || undefined, subdistrict: a.data.subdistrict, district: a.data.district, province: a.data.province, postalCode: a.data.postalCode, country: "TH" };
  }

  const result = await tenantTx(tenantId, (tx) =>
    createOrderFromCart(tx, tenantId, {
      cartToken: token,
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null,
      contact: { name: base.data.name, phone: base.data.phone, email: base.data.email || null },
      address,
      shippingMethodId: base.data.shippingMethodId,
      paymentMethod: base.data.paymentMethod,
      note: base.data.note ?? null,
      settings: runtime.config.settings,
    }),
  );
  if (!result.ok) {
    const field = result.code ? CODE_FIELD[result.code] : undefined;
    return { error: result.error, fieldErrors: field ? { [field]: result.error } : undefined };
  }

  revalidatePath("/cart");
  revalidatePath("/account/orders");
  redirect(`/orders/${result.value.orderId}?k=${encodeURIComponent(result.value.accessKey)}`);
}
