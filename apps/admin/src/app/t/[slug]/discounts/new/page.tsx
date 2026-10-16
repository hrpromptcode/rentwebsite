import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { DiscountForm, EMPTY_DISCOUNT } from "../discount-form";

export const metadata: Metadata = { title: "สร้างคูปอง" };

export default async function NewDiscountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/discounts`);
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/discounts`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="สร้างคูปอง" description="กำหนดโค้ด ส่วนลด และเงื่อนไขการใช้" className="flex-1" />
      </div>
      <DiscountForm slug={slug} discountId={null} initial={EMPTY_DISCOUNT} />
    </div>
  );
}
