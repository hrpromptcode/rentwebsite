import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getTenantCtx } from "@/lib/tenant";

/** Clinic pages only exist for tenants with the clinic module; everyone else gets a short explanation. */
export default async function ClinicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("clinic")) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="โมดูลคลินิกไม่ได้เปิดใช้"
        description="เว็บไซต์นี้ยังไม่ได้เปิดโมดูลคลินิก (ประวัติผู้ป่วย การตรวจ และคอร์ส) — ติดต่อผู้ดูแลแพลตฟอร์มเพื่อเพิ่มโมดูล"
        action={
          <Button asChild variant="outline">
            <Link href={`/t/${slug}/dashboard`}>กลับหน้าภาพรวม</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
