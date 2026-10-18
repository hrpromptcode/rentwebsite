import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { rentalBase } from "../../_lib";
import { EMPTY_UNIT, UnitTypeForm } from "../unit-form";

export const metadata: Metadata = { title: "เพิ่มประเภทห้องพัก" };

export default async function NewUnitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental") || !hasRole(ctx, "manager")) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="เพิ่มประเภทห้องพัก"
        description="ชื่อ รูป จำนวนห้อง ราคาต่อคืน และผู้เข้าพัก"
        actions={
          <Button asChild variant="ghost">
            <Link href={`${rentalBase(slug)}/units`}>
              <ArrowLeft aria-hidden /> กลับ
            </Link>
          </Button>
        }
      />
      <UnitTypeForm slug={slug} unitId={null} initial={EMPTY_UNIT} assetBase={process.env.WEB_URL ?? "http://localhost:3000"} canDelete={false} />
    </div>
  );
}
