import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, HeartPulse } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listPackagesAdmin, listServicesAdmin } from "@rentweb/module-booking/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { PackagesManager } from "./packages-manager";

export const metadata: Metadata = { title: "คอร์ส / แพ็กเกจ" };

export default async function ClinicPackagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const { pkgs, services } = await tenantTx(ctx.tenant.id, async (tx) => ({
    pkgs: await listPackagesAdmin(tx, ctx.tenant.id),
    services: await listServicesAdmin(tx, ctx.tenant.id),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="คอร์ส / แพ็กเกจ"
        description="คอร์สแบบหลายครั้งที่ขายให้ผู้ป่วย — ขายได้ทั้งหน้าร้านออนไลน์และที่เคาน์เตอร์ (หน้าประวัติผู้ป่วย)"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/clinic/patients`}>
                <HeartPulse aria-hidden /> ผู้ป่วย
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`${ctx.storefrontUrl}/packages`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> ดูหน้าร้าน
              </a>
            </Button>
          </>
        }
      />
      <PackagesManager
        slug={slug}
        canWrite={hasRole(ctx, "manager")}
        assetBase={assetUrl("/").replace(/\/$/, "")}
        services={services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
        rows={[...pkgs].sort((x, y) => Number(y.active) - Number(x.active)).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          image: p.image,
          serviceId: p.serviceId,
          serviceName: p.serviceName,
          sessions: p.sessions,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          validityDays: p.validityDays,
          active: p.active,
          sort: p.sort,
          sold: p.sold,
          activeOwners: p.activeOwners,
        }))}
      />
    </div>
  );
}
