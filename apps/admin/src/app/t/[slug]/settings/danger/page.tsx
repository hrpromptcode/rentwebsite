import type { Metadata } from "next";
import { AlertTriangle, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { cancelOwnTenant, reactivateOwnTenant, suspendOwnTenant } from "../actions";

export const metadata: Metadata = { title: "โซนอันตราย" };

export default async function DangerSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const owner = hasRole(ctx, "owner");
  const status = ctx.tenant.status;
  const suspend = suspendOwnTenant.bind(null, slug);
  const reactivate = reactivateOwnTenant.bind(null, slug);
  const cancel = cancelOwnTenant.bind(null, slug);

  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">การกระทำในหน้านี้ส่งผลกับหน้าร้านของคุณทันที</p>
          <p className="text-muted-foreground">{owner ? "เฉพาะเจ้าของร้านเท่านั้นที่ดำเนินการได้ และทุกการกระทำถูกบันทึกไว้" : "คุณไม่ใช่เจ้าของร้าน จึงดูได้อย่างเดียว"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === "suspended" ? <PlayCircle className="size-5 text-primary" aria-hidden /> : <PauseCircle className="size-5 text-primary" aria-hidden />}
            {status === "suspended" ? "เปิดใช้งานเว็บไซต์อีกครั้ง" : "ระงับเว็บไซต์ชั่วคราว"}
          </CardTitle>
          <CardDescription>
            สถานะปัจจุบัน: <StatusBadge status={status} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{status === "suspended" ? "ลูกค้าจะกลับมาเข้าหน้าร้านได้ตามปกติ ข้อมูลทั้งหมดยังอยู่ครบ" : "หน้าร้านจะแสดงข้อความปิดปรับปรุง ข้อมูลและการตั้งค่ายังอยู่ครบ สามารถเปิดกลับได้ทุกเมื่อ"}</p>
          {status === "suspended" ? (
            <ConfirmButton variant="default" title="เปิดใช้งานเว็บไซต์อีกครั้ง?" description="หน้าร้านจะกลับมาออนไลน์ทันที" confirmLabel="เปิดใช้งาน" action={reactivate} disabled={!owner}>
              <PlayCircle aria-hidden /> เปิดใช้งาน
            </ConfirmButton>
          ) : (
            <ConfirmButton variant="outline" title="ระงับเว็บไซต์ชั่วคราว?" description="ลูกค้าจะเข้าหน้าร้านไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง" confirmLabel="ระงับชั่วคราว" action={suspend} disabled={!owner || status === "cancelled"}>
              <PauseCircle aria-hidden /> ระงับชั่วคราว
            </ConfirmButton>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-5" aria-hidden /> ยกเลิกเว็บไซต์
          </CardTitle>
          <CardDescription>หน้าร้านจะปิด การเรียกเก็บเงินจะหยุด และข้อมูลจะถูกเก็บไว้ 30 วันก่อนลบถาวร</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{status === "cancelled" ? "เว็บไซต์นี้ถูกยกเลิกแล้ว หากต้องการเปิดกลับ กรุณาติดต่อทีมงาน RentWeb" : "หากไม่แน่ใจ แนะนำให้ระงับชั่วคราวแทน"}</p>
          {status === "cancelled" ? (
            <ConfirmButton variant="outline" title="เปิดใช้งานเว็บไซต์อีกครั้ง?" description="สถานะจะกลับเป็นใช้งาน/ทดลองใช้ตามรอบเดิม" confirmLabel="เปิดใช้งาน" action={reactivate} disabled={!owner}>
              <PlayCircle aria-hidden /> เปิดใช้งานอีกครั้ง
            </ConfirmButton>
          ) : (
            <ConfirmButton variant="destructive" title={`ยกเลิกเว็บไซต์ ${ctx.tenant.name}?`} description="หน้าร้านจะปิดทันที ข้อมูลจะถูกเก็บไว้ 30 วัน จากนั้นจะถูกลบถาวร" confirmLabel="ยืนยันยกเลิก" action={cancel} disabled={!owner}>
              <XCircle aria-hidden /> ยกเลิกเว็บไซต์
            </ConfirmButton>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
