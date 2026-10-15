import type { Metadata } from "next";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { readPayments } from "../shared";
import { PaymentsForm } from "./payments-form";

export const metadata: Metadata = { title: "ช่องทางรับเงิน" };

export default async function PaymentsSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const contactPhone = String(((settings.contact ?? {}) as { phone?: string }).phone ?? "");
  return <PaymentsForm slug={slug} initial={readPayments(settings)} contactPhone={contactPhone} canEdit={hasRole(ctx, "admin")} hasWallet={ctx.modules.includes("topup")} />;
}
