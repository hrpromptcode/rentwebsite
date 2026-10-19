"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelPayment, enabledMethods, getPayment, isPaymentStateError } from "@rentweb/core/payments";
import { isUuid } from "@rentweb/core";

import { createWalletTopup, getWallet, getWalletTopup, topupConfig } from "@rentweb/module-topup/services";
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

/**
 * "ยกเลิก" on a pending wallet top-up (STOREFRONT-13): voids its payment through the shared payment layer
 * (payment.cancelled event + the module's closed handler, when registered) and closes the wallet_topups row.
 * Only the signed-in owner of the wallet may cancel, and only while no slip has been sent (status pending) —
 * a slip under review is left for the shop to verify so a real transfer is never orphaned.
 */
export async function cancelWalletTopupAction(tenantId: string, topupId: string): Promise<void> {
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/wallet")}`);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup") || !isUuid(topupId)) redirect("/wallet");

  const outcome = await tenantTx(tenantId, async (tx): Promise<"cancelled" | "slip_sent" | "gone"> => {
    const wallet = await getWallet(tx, tenantId, customer.id);
    const topup = await getWalletTopup(tx, tenantId, topupId);
    if (!wallet || !topup || topup.walletId !== wallet.id || !topup.paymentId) return "gone";
    if (topup.status !== "pending") return topup.status === "pending_verification" ? "slip_sent" : "gone";
    const payment = await getPayment(tx, tenantId, topup.paymentId);
    if (!payment) return "gone";
    if (payment.status === "pending_verification") return "slip_sent";
    if (payment.status !== "pending") return "gone";
    try {
      await cancelPayment(tx, tenantId, payment.id, "ลูกค้ายกเลิกรายการเติมเงิน");
    } catch (err) {
      if (isPaymentStateError(err)) return "gone"; // paid / closed concurrently
      throw err;
    }
    // the module's wallet_topup closed handler (services/wallet.ts onWalletTopupPaymentClosed) closes the row as "cancelled"
    return "cancelled";
  });

  revalidatePath("/wallet");
  if (outcome === "cancelled") redirect("/wallet?cancelled=1");
  if (outcome === "slip_sent") redirect(`/wallet?topup=${topupId}&cancel=slip`);
  redirect(`/wallet?topup=${topupId}`);
}
