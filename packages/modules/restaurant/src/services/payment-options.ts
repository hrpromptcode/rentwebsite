import { enabledMethods, PAYMENTS_NOT_CONFIGURED_MESSAGE } from "@rentweb/core/payments";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { L } from "../labels";

export type RestaurantPayMethod = "promptpay_qr" | "slip" | "cash";

const LABELS: Record<RestaurantPayMethod, { label: string; description: string }> = {
  promptpay_qr: { label: L.promptpay, description: L.promptpayDesc },
  slip: { label: L.slip, description: L.slipDesc },
  cash: { label: L.cash, description: L.cashDesc },
};

/**
 * Payment options for the restaurant flows, from the tenant's enabled methods.
 *  - pickup: PromptPay / slip / cash (pay when collecting)
 *  - reservation deposit: PromptPay / slip only
 */
export function restaurantPaymentOptions(settings: Record<string, unknown>, flow: "pickup" | "reservation"): PaymentMethodOption[] {
  const allowed: RestaurantPayMethod[] = flow === "pickup" ? ["promptpay_qr", "slip", "cash"] : ["promptpay_qr", "slip"];
  const enabled = enabledMethods(settings) as string[];
  return allowed.filter((m) => enabled.includes(m)).map((m) => ({ value: m, label: LABELS[m].label, description: LABELS[m].description }));
}

/**
 * Thai notice for the storefront when a flow has no way to pay (ADMIN_B2-04): enabledMethods() only lists
 * methods with a receiver (PromptPay ID / bank account) or cash the owner enabled. Null = at least one works.
 */
export function restaurantPaymentNotice(settings: Record<string, unknown>, flow: "pickup" | "reservation"): string | null {
  if (restaurantPaymentOptions(settings, flow).length) return null;
  return flow === "pickup"
    ? `${PAYMENTS_NOT_CONFIGURED_MESSAGE} จึงยังสั่งอาหารกลับบ้านทางออนไลน์ไม่ได้ กรุณาโทรสั่งที่ร้าน`
    : `${PAYMENTS_NOT_CONFIGURED_MESSAGE} จึงยังรับมัดจำการจองทางออนไลน์ไม่ได้ กรุณาโทรจองที่ร้าน`;
}
