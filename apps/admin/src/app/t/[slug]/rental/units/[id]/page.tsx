import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getUnitTypeById } from "@rentweb/module-rental/admin";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../../_lib";
import { UnitTypeForm, unitToForm } from "../unit-form";

export const metadata: Metadata = { title: "แก้ไขประเภทห้องพัก" };

export default async function EditUnitPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const type = await tenantTx(ctx.tenant.id, (tx) => getUnitTypeById(tx, ctx.tenant.id, id));
  if (!type) notFound();
  const canWrite = hasRole(ctx, "manager");
  return (
    <div className="space-y-6">
      <PageHeader
        title={type.name}
        eyebrow="ประเภทห้องพัก"
        description={`${type.quantity} ห้อง · /rooms/${type.slug}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`${ctx.storefrontUrl}/rooms/${encodeURIComponent(type.slug)}`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> ดูบนหน้าร้าน
              </a>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`${rentalBase(slug)}/units`}>
                <ArrowLeft aria-hidden /> กลับ
              </Link>
            </Button>
          </>
        }
      />
      {canWrite ? <UnitTypeForm slug={slug} unitId={type.id} initial={unitToForm(type)} assetBase={process.env.WEB_URL ?? "http://localhost:3000"} canDelete /> : <p className="text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว</p>}
    </div>
  );
}
