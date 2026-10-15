import { enabledMethods } from "@rentweb/core/payments";
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
