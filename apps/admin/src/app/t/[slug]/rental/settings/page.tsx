import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { getAdminDb } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { enabledMethods, paymentSetupStatus } from "@rentweb/core/payments";
import { loadRentalModuleConfig } from "@rentweb/module-rental/admin";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { rentalBase } from "../_lib";
import { RentalSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "นโยบายการจองห้องพัก" };

export default async function RentalSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const cfg = await loadRentalModuleConfig(getAdminDb(), ctx.tenant.id);
  const c = cfg.rental;
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const payReady = paymentSetupStatus(settings).ready;
  const cashEnabled = enabledMethods(settings).includes("cash");
  return (
    <div className="space-y-6">
      <PageHeader
        title="นโยบายการจองห้องพัก"
        description="เวลาเช็กอิน/เช็กเอาต์ การยกเลิก มัดจำ และข้อจำกัดการจองออนไลน์ (ใช้กับทุกประเภทห้อง)"
        actions={
          <Button asChild variant="ghost">
            <Link href={`${rentalBase(slug)}/bookings`}>
              <ArrowLeft aria-hidden /> การจองห้องพัก
            </Link>
          </Button>
        }
      />
      {!payReady && c.depositPercent > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50">
          <CreditCard className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">ที่พักยังไม่ได้ตั้งค่าช่องทางรับเงินออนไลน์ (PromptPay / บัญชีธนาคาร) — การจองจะยืนยันทันทีโดยไม่เก็บมัดจำ และเก็บเงินที่ที่พัก</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/t/${slug}/settings/payments`}>ตั้งค่ารับเงิน</Link>
          </Button>
        </p>
      )}
      <RentalSettingsForm
        slug={slug}
        canWrite={hasRole(ctx, "admin")}
        cashEnabled={cashEnabled}
        initial={{ checkInTime: c.checkInTime, checkOutTime: c.checkOutTime, freeCancelDays: String(c.freeCancelDays), depositPercent: String(c.depositPercent), allowFullPayment: c.allowFullPayment, allowPayAtProperty: c.allowPayAtProperty, maxAdvanceDays: String(c.maxAdvanceDays), maxNights: String(c.maxNights), holdMinutes: String(c.holdMinutes) }}
      />
    </div>
  );
}
