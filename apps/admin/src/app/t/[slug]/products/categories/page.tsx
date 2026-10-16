import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listAdminCategories } from "@rentweb/module-commerce/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "หมวดหมู่สินค้า" };

export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const cats = await tenantTx(ctx.tenant.id, (tx) => listAdminCategories(tx, ctx.tenant.id));
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการสินค้า">
          <Link href={`/t/${slug}/products`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="หมวดหมู่สินค้า" description={`${fmtNumber(cats.length)} หมวดหมู่ · ลำดับน้อยแสดงก่อนบนหน้าร้าน`} className="flex-1" />
      </div>
      <CategoryManager
        slug={slug}
        canWrite={hasRole(ctx, "manager")}
        categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, image: c.image, imageSrc: c.image ? assetUrl(c.image) : null, parentId: c.parentId, sort: c.sort, productCount: c.productCount }))}
      />
    </div>
  );
}
