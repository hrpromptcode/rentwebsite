import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getAdminShippingMethod, shippingFormValues } from "@rentweb/module-commerce/admin";
import { SHIPPING_TYPE } from "@rentweb/module-commerce/admin/labels";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ShippingForm, toShippingForm } from "../shipping-form";

export const metadata: Metadata = { title: "แก้ไขวิธีจัดส่ง" };

export default async function EditShippingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const m = await tenantTx(ctx.tenant.id, (tx) => getAdminShippingMethod(tx, ctx.tenant.id, id));
  if (!m) notFound();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/shipping`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title={m.name} description={SHIPPING_TYPE[m.type]?.label ?? m.type} className="flex-1" />
      </div>
      {hasRole(ctx, "manager") ? <ShippingForm slug={slug} methodId={m.id} initial={toShippingForm(shippingFormValues(m))} /> : <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว</p>}
    </div>
  );
}
