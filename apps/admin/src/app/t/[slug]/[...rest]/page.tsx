import Link from "next/link";
import { Construction } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { findNavLabel } from "@/lib/nav";
import { getTenantCtx } from "@/lib/tenant";

/** Placeholder for module routes (orders, products, bookings…) that ship in a later phase. */
export default async function ModulePlaceholderPage({ params }: { params: Promise<{ slug: string; rest: string[] }> }) {
  const { slug, rest } = await params;
  const ctx = await getTenantCtx(slug);
  const pathname = `/t/${slug}/${rest.join("/")}`;
  const label = findNavLabel(slug, ctx.modules, pathname) ?? rest.join(" / ");
  return (
    <div className="space-y-6">
      <PageHeader title={label} description="ส่วนนี้อยู่ระหว่างการพัฒนา" />
      <EmptyState
        icon={Construction}
        title="กำลังพัฒนาในเฟสถัดไป"
        description="หน้านี้จะเปิดให้ใช้งานในเวอร์ชันถัดไป ระหว่างนี้คุณยังจัดการหน้าเว็บ ดีไซน์ สื่อ ลูกค้า และการตั้งค่าได้ตามปกติ"
        action={
          <Button asChild variant="outline">
            <Link href={`/t/${slug}/dashboard`}>กลับไปหน้าภาพรวม</Link>
          </Button>
        }
      />
    </div>
  );
}
