import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { assetBase, eventsBase } from "../_lib";
import { EMPTY_EVENT, EventForm } from "../event-form";

export const metadata: Metadata = { title: "สร้างอีเวนต์" };

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events") || !hasRole(ctx, "manager")) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="สร้างอีเวนต์"
        description="ขั้นที่ 1 จาก 3: ข้อมูลงานและรูปภาพ — หลังสร้างแล้วจึงเพิ่มรอบและประเภทบัตร แล้วกดเผยแพร่"
        actions={
          <Button asChild variant="ghost">
            <Link href={eventsBase(slug)}>
              <ArrowLeft aria-hidden /> กลับ
            </Link>
          </Button>
        }
      />
      <EventForm slug={slug} eventId={null} initial={EMPTY_EVENT} assetBase={assetBase()} canWrite />
    </div>
  );
}
