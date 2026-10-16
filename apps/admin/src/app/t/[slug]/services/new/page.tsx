import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listCategoriesAdmin } from "@rentweb/module-booking/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { EMPTY_SERVICE } from "../form-values";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "เพิ่มบริการ" };

export default async function NewServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/services`);
  const cats = await tenantTx(ctx.tenant.id, (tx) => listCategoriesAdmin(tx, ctx.tenant.id));
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการบริการ">
          <Link href={`/t/${slug}/services`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="เพิ่มบริการ" description="กำหนดเวลา ราคา และมัดจำ จากนั้นเลือกพนักงานที่ให้บริการนี้ได้ในหน้าพนักงาน" className="min-w-0 flex-1" />
      </div>
      <ServiceForm slug={slug} serviceId={null} initial={EMPTY_SERVICE} categories={cats.map((c) => ({ id: c.id, name: c.name }))} assetBase={assetUrl("/").replace(/\/$/, "")} canDelete={false} />
    </div>
  );
}
