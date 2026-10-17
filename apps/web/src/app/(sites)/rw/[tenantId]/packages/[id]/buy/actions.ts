"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isUuid } from "@rentweb/core";
import { clinicConfig, memberNumberPrefix, packagesEnabled, purchasePackage } from "@rentweb/module-booking/services";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

export type BuyState = { error?: string };

// SBR-007: the PDPA / terms checkbox is validated on the server and recorded on the patient
const schema = z.object({ paymentMethod: z.enum(["promptpay_qr", "slip"]), consent: z.literal("on", { error: "consent_required" }) });
const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";

/** Buys a clinic package for the signed-in customer → redirects to the payment page under /account/packages/[id]. */
export async function purchasePackageAction(tenantId: string, packageId: string, _prev: BuyState, form: FormData): Promise<BuyState> {
  if (!isUuid(packageId)) return { error: msg("package_not_found") };
  const parsed = schema.safeParse({ paymentMethod: form.get("paymentMethod"), consent: form.get("consent") });
  if (!parsed.success) return { error: msg(parsed.error.issues.some((i) => i.path[0] === "consent") ? "consent_required" : "invalid_input") };
  const runtime = await getRuntime(tenantId);
  if (!runtime || !packagesEnabled(runtime.config.modules, runtime.config.moduleConfig)) return { error: msg("unknown") };
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(`/packages/${packageId}/buy`)}`);

  const result = await tenantTx(tenantId, (tx) =>
    purchasePackage(
      tx,
      tenantId,
      { packageId, customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }, paymentMethod: parsed.data.paymentMethod, consent: { version: clinicConfig(runtime.config.moduleConfig).consentVersion } },
      { settings: runtime.config.settings, hnPrefix: memberNumberPrefix(runtime.config.modules, runtime.config.moduleConfig) },
    ),
  );
  if (!result.ok) return { error: msg(result.error) };
  revalidatePath(`/rw/${tenantId}/account/packages`);
  redirect(`/account/packages/${result.value.patientPackage.id}`);
}
