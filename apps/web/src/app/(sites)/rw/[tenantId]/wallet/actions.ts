"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enabledMethods } from "@rentweb/core/payments";
import { createWalletTopup, topupConfig } from "@rentweb/module-topup/services";
import { errorLabel } from "@rentweb/module-topup/labels";
import type { WalletTopupState } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const schema = z.object({
  amount: z.coerce.number().int().positive().max(100_000_00), // satang, ≤ ฿100,000
  paymentMethod: z.enum(["promptpay_qr", "slip"]),
});

/** Creates a pending wallet top-up + payment, then shows the payment panel on /wallet?topup=<id>. */
export async function createWalletTopupAction(tenantId: string, _prev: WalletTopupState, form: FormData): Promise<WalletTopupState> {
  const parsed = schema.safeParse({ amount: form.get("amount"), paymentMethod: form.get("paymentMethod") });
  if (!parsed.success) return { error: errorLabel("invalid_amount") };
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/wallet")}`);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) return { error: errorLabel("invalid") };
  if (!enabledMethods(runtime.config.settings).includes(parsed.data.paymentMethod)) return { error: errorLabel("method_disabled") };
  const cfg = topupConfig(runtime.config.moduleConfig.topup);

  const result = await tenantTx(tenantId, (tx) =>
    createWalletTopup(tx, tenantId, {
      customerId: customer.id,
      amount: parsed.data.amount,
      method: parsed.data.paymentMethod,
      settings: runtime.config.settings,
      bonusPercent: cfg.walletBonusPercent,
      minAmount: cfg.minWalletTopup,
    }),
  );
  if (!result.ok) return { error: errorLabel(result.code ?? result.error) };
  revalidatePath("/wallet");
  redirect(`/wallet?topup=${result.value.topup.id}`);
}
