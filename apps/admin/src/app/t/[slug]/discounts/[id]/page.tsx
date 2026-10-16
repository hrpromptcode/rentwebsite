import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getDiscount } from "@rentweb/module-commerce/admin";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { DiscountForm, toDiscountForm } from "../discount-form";

export const metadata: Metadata = { title: "แก้ไขคูปอง" };

export default async function EditDiscountPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const d = await tenantTx(ctx.tenant.id, (tx) => getDiscount(tx, ctx.tenant.id, id));
  if (!d) notFound();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/discounts`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title={<span className="font-mono">{d.code}</span>} description={`ใช้แล้ว ${fmtNumber(d.usedCount)} ครั้ง${d.maxUses ? ` จาก ${fmtNumber(d.maxUses)}` : ""}`} className="flex-1" />
      </div>
      {hasRole(ctx, "manager") ? <DiscountForm slug={slug} discountId={d.id} initial={toDiscountForm(d)} /> : <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว</p>}
    </div>
  );
}
