import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, ExternalLink, Star } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getAdminProduct, listAdminCategories } from "@rentweb/module-commerce/admin";
import { htmlToDescription } from "@rentweb/module-commerce/admin/schemas";
import { ProductStatusBadge } from "@rentweb/module-commerce/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { assetUrl, fmtDate, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { archiveProductAction } from "../actions";
import { toFormValues } from "../form-values";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "แก้ไขสินค้า" };

export default async function EditProductPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const { data, cats } = await tenantTx(ctx.tenant.id, async (tx) => ({ data: await getAdminProduct(tx, ctx.tenant.id, id), cats: await listAdminCategories(tx, ctx.tenant.id) }));
  if (!data) notFound();
  const { product, variants } = data;
  const canWrite = hasRole(ctx, "manager");
  const archive = archiveProductAction.bind(null, slug, product.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการสินค้า">
            <Link href={`/t/${slug}/products`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
              <ProductStatusBadge status={product.status} />
              {product.featured && <Star className="size-4 fill-amber-400 text-amber-400" aria-label="สินค้าแนะนำ" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              ขายแล้ว {fmtNumber(product.soldCount)} ชิ้น · คะแนน {product.ratingCount ? `${(product.ratingAvg / 100).toFixed(1)} (${product.ratingCount} รีวิว)` : "ยังไม่มีรีวิว"} · แก้ไขล่าสุด {fmtDate(product.updatedAt, { withTime: true })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <a href={`${ctx.storefrontUrl}/products/${product.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> ดูบนหน้าร้าน
            </a>
          </Button>
          {canWrite && product.status !== "archived" && (
            <ConfirmButton variant="ghost" className="text-destructive hover:text-destructive" title="เก็บสินค้าเข้าคลังถาวร?" description="สินค้าจะหายจากหน้าร้านและรายการสินค้า แต่ออเดอร์เก่ายังอ้างอิงได้ คุณสามารถกู้คืนได้จากแท็บ “เก็บถาวร”" confirmLabel="เก็บถาวร" action={archive}>
              <Archive aria-hidden /> ลบ (เก็บถาวร)
            </ConfirmButton>
          )}
        </div>
      </div>
      {canWrite ? (
        <ProductForm slug={slug} productId={product.id} initial={toFormValues(product, variants, htmlToDescription(product.description))} categories={cats.map((c) => ({ id: c.id, name: c.name }))} assetBase={assetUrl("/").replace(/\/$/, "")} />
      ) : (
        <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว — ติดต่อผู้จัดการร้านเพื่อแก้ไขสินค้า</p>
      )}
    </div>
  );
}
