import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { listModifierGroupsAdmin } from "@rentweb/module-restaurant/admin";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ModifierManager } from "./modifier-manager";

export const metadata: Metadata = { title: "กลุ่มตัวเลือก" };

export default async function ModifiersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const groups = await tenantTx(ctx.tenant.id, (tx) => listModifierGroupsAdmin(tx, ctx.tenant.id));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`/t/${slug}/restaurant/menu`} className="inline-flex items-center gap-1 normal-case tracking-normal hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> กลับไปหน้าเมนู
          </Link>
        }
        title="กลุ่มตัวเลือก"
        description="ตัวเลือกที่ลูกค้าเลือกตอนสั่ง เช่น ระดับความเผ็ด ความหวาน ท็อปปิ้ง · ผูกกลุ่มกับเมนูได้ในหน้าแก้ไขเมนู"
        actions={
          <Button asChild variant="outline">
            <Link href={`/t/${slug}/restaurant/menu`}>ไปหน้าเมนู</Link>
          </Button>
        }
      />
      <ModifierManager slug={slug} groups={groups} canEdit={hasRole(ctx, "manager")} />
    </div>
  );
}
