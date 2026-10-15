"use server";

import { revalidatePath } from "next/cache";
import { cancelUnpaidOrder } from "@rentweb/module-commerce/services";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

/** Customer cancels an unpaid order (restocks, voids the payment). Bound to (tenantId, orderId, accessKey). */
export async function cancelOrderAction(tenantId: string, orderId: string, accessKey: string | null): Promise<{ error?: string } | void> {
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return { error: L.errGeneric };
  const customer = await getCurrentCustomer(tenantId);
  const r = await tenantTx(tenantId, (tx) => cancelUnpaidOrder(tx, tenantId, orderId, { customerId: customer?.id ?? null, accessKey }));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/account/orders");
}
