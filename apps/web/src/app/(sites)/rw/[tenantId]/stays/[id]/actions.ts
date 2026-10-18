"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import type { PaymentMethod } from "@rentweb/core/payments";
import { cancelStay, getStayForCustomer, renewStayPayment, rentalConfig } from "@rentweb/module-rental/services";
import { L } from "@rentweb/module-rental/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

export type StayActionState = { error?: string; ok?: boolean };

const msg = (code: string) => L.errors[code] ?? L.errors.unknown ?? "เกิดข้อผิดพลาด";
const keyQs = (key: string | null) => (key ? `?k=${encodeURIComponent(key)}` : "");

/** Loads tenant + stay only when the caller is the owner or holds the access key. */
async function authorise(tenantId: string, stayId: string, key: string | null) {
  if (!isUuid(stayId)) return null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) return null;
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getStayForCustomer(tx, tenantId, stayId, { customerId: customer?.id, key }));
  if (!detail) return null;
  return { runtime, detail, config: rentalConfig(runtime.config.moduleConfig) };
}

function revalidate(tenantId: string, stayId: string) {
  revalidatePath(`/rw/${tenantId}/stays/${stayId}`);
  revalidatePath(`/rw/${tenantId}/account/stays`);
}

/** Guest cancels under the freeCancelDays policy. Bound as (tenantId, stayId, key) → useActionState. */
export async function cancelStayAction(tenantId: string, stayId: string, key: string | null, _prev: StayActionState, form: FormData): Promise<StayActionState> {
  const auth = await authorise(tenantId, stayId, key);
  if (!auth) return { error: msg("not_found") };
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  const result = await tenantTx(tenantId, (tx) => cancelStay(tx, tenantId, stayId, { by: "customer", reason, config: auth.config }));
  if (!result.ok) return { error: msg(result.error) };
  revalidate(tenantId, stayId);
  redirect(`/stays/${stayId}${keyQs(key)}`);
}

/** Issues a fresh payment (new QR) when there is no live one; the expired / rejected one is voided first. */
export async function renewPaymentAction(tenantId: string, stayId: string, key: string | null): Promise<void> {
  const auth = await authorise(tenantId, stayId, key);
  if (!auth) return;
  const { payment } = auth.detail;
  await tenantTx(tenantId, (tx) => renewStayPayment(tx, tenantId, stayId, (payment?.method as PaymentMethod | undefined) ?? null, { config: auth.config, settings: auth.runtime.config.settings }));
  revalidate(tenantId, stayId);
  redirect(`/stays/${stayId}${keyQs(key)}`);
}
