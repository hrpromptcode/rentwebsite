"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createTopupOrder, topupConfig } from "@rentweb/module-topup/services";
import { errorLabel } from "@rentweb/module-topup/labels";
import type { TopupFormState } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer, requestMeta } from "@/lib/customer";

const schema = z.object({
  packageId: z.string().uuid(),
  paymentMethod: z.enum(["wallet", "promptpay_qr", "slip"]),
  contact: z.string().trim().max(120).optional(),
});

/** Server action bound to (tenantId, gameSlug) by the game page. Redirects to the order page on success. */
export async function createTopupOrderAction(tenantId: string, gameSlug: string, _prev: TopupFormState, form: FormData): Promise<TopupFormState> {
  const parsed = schema.safeParse({ packageId: form.get("packageId"), paymentMethod: form.get("paymentMethod"), contact: form.get("contact") || undefined });
  if (!parsed.success) return { error: errorLabel("invalid") };

  const playerFields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("pf_") && typeof v === "string") playerFields[k.slice(3)] = v;

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) return { error: errorLabel("game_not_found") };
  const [customer, meta] = await Promise.all([getCurrentCustomer(tenantId), requestMeta()]);
  if (!customer && !parsed.data.contact) return { error: "กรุณากรอกเบอร์โทรหรืออีเมลสำหรับติดตามรายการ", field: "contact" };

  const result = await tenantTx(tenantId, (tx) =>
    createTopupOrder(tx, tenantId, {
      gameSlug,
      packageId: parsed.data.packageId,
      playerFields,
      paymentMethod: parsed.data.paymentMethod,
      contact: parsed.data.contact ?? customer?.phone ?? customer?.email ?? null,
      customer: customer ? { id: customer.id, tier: customer.tier } : null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      settings: runtime.config.settings,
      config: topupConfig(runtime.config.moduleConfig.topup),
    }),
  );
  if (!result.ok) return { error: errorLabel(result.code ?? result.error) };

  revalidatePath("/account/topups");
  revalidatePath("/wallet");
  redirect(`/topup/${result.value.order.number}?k=${encodeURIComponent(result.value.accessKey)}`);
}
