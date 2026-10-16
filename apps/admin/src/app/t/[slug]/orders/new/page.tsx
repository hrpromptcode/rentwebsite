import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listAdminShippingMethods, manualOrderCatalog } from "@rentweb/module-commerce/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "สร้างออเดอร์" };

export default async function NewOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/orders`);
  const { catalog, methods } = await tenantTx(ctx.tenant.id, async (tx) => ({
    catalog: await manualOrderCatalog(tx, ctx.tenant.id),
    methods: await listAdminShippingMethods(tx, ctx.tenant.id),
  }));
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/orders`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="สร้างออเดอร์" description="สำหรับลูกค้าที่สั่งทาง LINE โทรศัพท์ หรือหน้าร้าน — ระบบจะตัดสต็อกและเปิดรายการชำระเงินให้เหมือนออเดอร์ปกติ" className="flex-1" />
      </div>
      <NewOrderForm
        slug={slug}
        catalog={catalog.map((p) => ({ ...p, image: p.image ? assetUrl(p.image) : null }))}
        methods={methods
          .filter((m) => m.active)
          .map((m) => ({ id: m.id, name: m.name, type: m.type, config: (m.config ?? {}) as Record<string, unknown>, estimatedDays: m.estimatedDays }))}
      />
    </div>
  );
}
