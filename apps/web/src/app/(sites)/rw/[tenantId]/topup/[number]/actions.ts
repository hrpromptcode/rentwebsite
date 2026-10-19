"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOrderForCustomer, renewTopupPayment, topupConfig } from "@rentweb/module-topup/services";
import { parseTopupOrderNumber } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

/**
 * "ชำระเงินใหม่" on /topup/<number> (review RV-03): the slip was rejected or the QR lapsed while the order is still
 * waiting for money → a fresh payment for the same order. Only the order's owner or the holder of its access key
 * (?k=) may do it; the service re-checks every state (paid / slip under review / still payable → refused).
 */
export async function renewTopupPaymentAction(tenantId: string, rawNumber: string, accessKey: string | null): Promise<void> {
  const number = parseTopupOrderNumber(rawNumber);
  const runtime = await getRuntime(tenantId);
  if (!number || !runtime || !runtime.config.modules.includes("topup")) redirect("/topup/status");
  const customer = await getCurrentCustomer(tenantId);
  const key = typeof accessKey === "string" && accessKey ? accessKey.slice(0, 200) : null;
  const keyQs = key ? `k=${encodeURIComponent(key)}` : "";

  const outcome = await tenantTx(tenantId, async (tx) => {
    const order = await getOrderForCustomer(tx, tenantId, { number, customerId: customer?.id ?? null, accessKey: key });
    if (!order) return "denied" as const;
    const r = await renewTopupPayment(tx, tenantId, order.id, { settings: runtime.config.settings, config: topupConfig(runtime.config.moduleConfig.topup) });
    return r.ok ? ("renewed" as const) : r.error;
  });

  revalidatePath(`/topup/${number}`);
  if (outcome === "denied") redirect(`/topup/${number}`);
  const qs = [keyQs, outcome === "renewed" ? "" : `renew=${outcome}`].filter(Boolean).join("&");
  redirect(`/topup/${number}${qs ? `?${qs}` : ""}`);
}
