import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { EMPTY_GAME } from "../form-values";
import { GameForm } from "../game-form";

export const metadata: Metadata = { title: "เพิ่มเกม" };

export default async function NewTopupGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "manager")) redirect(`/t/${slug}/topup/games`);
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการเกม">
          <Link href={`/t/${slug}/topup/games`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="เพิ่มเกม" description="ตั้งชื่อ รูป และช่องข้อมูลผู้เล่น — บันทึกแล้วเพิ่มแพ็กเกจต่อได้ทันที" className="flex-1" />
      </div>
      <GameForm slug={slug} gameId={null} initial={EMPTY_GAME} />
    </div>
  );
}
