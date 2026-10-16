import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listAdminCategories } from "@rentweb/module-commerce/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { EMPTY_PRODUCT } from "../form-values";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "เพิ่มสินค้า" };

export default async function NewProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/products`);
  const cats = await tenantTx(ctx.tenant.id, (tx) => listAdminCategories(tx, ctx.tenant.id));
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/products`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="เพิ่มสินค้า" description="กรอกข้อมูล บันทึกเป็นฉบับร่างก่อน หรือเผยแพร่ทันที" className="flex-1" />
      </div>
      <ProductForm slug={slug} productId={null} initial={EMPTY_PRODUCT} categories={cats.map((c) => ({ id: c.id, name: c.name }))} assetBase={assetUrl("/").replace(/\/$/, "")} />
    </div>
  );
}
