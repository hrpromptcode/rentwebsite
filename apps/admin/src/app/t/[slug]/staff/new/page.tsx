import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listServicesAdmin } from "@rentweb/module-booking/admin";
import { STAFF_COLORS } from "@rentweb/module-booking/admin/labels";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { EMPTY_STAFF } from "../form-values";
import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "เพิ่มพนักงาน" };

export default async function NewStaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/staff`);
  const services = await tenantTx(ctx.tenant.id, (tx) => listServicesAdmin(tx, ctx.tenant.id));
  const color = STAFF_COLORS[Math.floor(Math.random() * STAFF_COLORS.length)] ?? "#6366f1";
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการพนักงาน">
          <Link href={`/t/${slug}/staff`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="เพิ่มพนักงาน / ทรัพยากร" description="บันทึกข้อมูลก่อน แล้วตั้งตารางงานและวันหยุดได้ในหน้าถัดไป" className="min-w-0 flex-1" />
      </div>
      <StaffForm
        slug={slug}
        staffId={null}
        initial={{ ...EMPTY_STAFF, color }}
        services={services.map((s) => ({ id: s.id, name: s.name, categoryName: s.categoryName, durationMin: s.durationMin, active: s.active }))}
        assetBase={assetUrl("/").replace(/\/$/, "")}
        canDelete={false}
      />
    </div>
  );
}
