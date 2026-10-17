import type { Metadata } from "next";
import { enabledMethods, paymentSetupStatus, thaiMobilePromptpay } from "@rentweb/core/payments";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { readPayments } from "../shared";
import { PaymentsForm, type SavedPaymentStatus } from "./payments-form";

export const metadata: Metadata = { title: "ช่องทางรับเงิน" };

export default async function PaymentsSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const contactPhone = String(((settings.contact ?? {}) as { phone?: string }).phone ?? "");
  const initial = readPayments(settings);
  // ADMIN_B2-09: what checkout will really use, from the saved settings (the same rule the storefront applies)
  const setup = paymentSetupStatus(settings);
  const status: SavedPaymentStatus = {
    ...setup,
    promptpayFromContact: !!setup.promptpayId && !String(initial.promptpayId ?? "").trim(),
    offline: enabledMethods(settings).filter((m): m is "cod" | "cash" => m === "cod" || m === "cash"),
  };
  return <PaymentsForm slug={slug} initial={initial} status={status} contactPhone={contactPhone} contactMobile={thaiMobilePromptpay(contactPhone)} canEdit={hasRole(ctx, "admin")} hasWallet={ctx.modules.includes("topup")} />;
}
