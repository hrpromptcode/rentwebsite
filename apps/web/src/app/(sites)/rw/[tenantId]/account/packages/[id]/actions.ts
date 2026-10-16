"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import type { PaymentMethod } from "@rentweb/core/payments";
import { createPackagePayment, getPatientPackageForCustomer } from "@rentweb/module-booking/services";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

/** Re-issues the payment (new QR) for a pending package whose previous one expired. */
export async function renewPackagePaymentAction(tenantId: string, patientPackageId: string): Promise<void> {
  if (!isUuid(patientPackageId)) return;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("clinic")) return;
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(`/account/packages/${patientPackageId}`)}`);
  await tenantTx(tenantId, async (tx) => {
    const item = await getPatientPackageForCustomer(tx, tenantId, patientPackageId, customer);
    if (!item || item.status !== "pending" || item.payment?.status === "paid" || item.payment?.status === "pending_verification") return;
    await createPackagePayment(tx, tenantId, item, (item.payment?.method as PaymentMethod | undefined) ?? null, customer.id, runtime.config.settings);
  });
  revalidatePath(`/rw/${tenantId}/account/packages/${patientPackageId}`);
  redirect(`/account/packages/${patientPackageId}`);
}
