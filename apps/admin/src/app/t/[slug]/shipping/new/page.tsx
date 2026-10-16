import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { EMPTY_SHIPPING, ShippingForm } from "../shipping-form";

export const metadata: Metadata = { title: "เพิ่มวิธีจัดส่ง" };

export default async function NewShippingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/shipping`);
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/shipping`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="เพิ่มวิธีจัดส่ง" description="เลือกประเภทแล้วกำหนดค่าส่ง" className="flex-1" />
      </div>
      <ShippingForm slug={slug} methodId={null} initial={EMPTY_SHIPPING} />
    </div>
  );
}
