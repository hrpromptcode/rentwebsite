import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, PauseCircle, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate } from "@/lib/format";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { loadSuspensionInfo } from "@/lib/tenant-status-server";
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
  // Only a suspension the owner made themselves can be lifted here; RentWeb suspensions,
  // cancellations and unpaid (past_due) sites go through staff / billing.
  const suspension = status === "suspended" ? await loadSuspensionInfo(ctx.tenant.id) : null;
  const selfSuspended = suspension?.by === "owner";
  const platformSuspended = status === "suspended" && !selfSuspended;

  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">การกระทำในหน้านี้ส่งผลกับหน้าร้านของคุณทันที</p>
          <p className="text-muted-foreground">{owner ? "เฉพาะเจ้าของร้านเท่านั้นที่ดำเนินการได้ และทุกการกระทำถูกบันทึกไว้" : "คุณไม่ใช่เจ้าของร้าน จึงดูได้อย่างเดียว"}</p>
        </div>
      </div>

      {platformSuspended && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">เว็บไซต์ถูกระงับโดยทีมงาน RentWeb{suspension?.at ? ` เมื่อ ${fmtDate(suspension.at)}` : ""}</p>
            {suspension?.reason && <p className="break-words text-muted-foreground">เหตุผล: {suspension.reason}</p>}
            <p className="text-muted-foreground">กรุณาติดต่อทีมงาน RentWeb เพื่อเปิดใช้งานอีกครั้ง</p>
          </div>
        </div>
      )}
      {status === "past_due" && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">เว็บไซต์ค้างชำระค่าบริการ</p>
            <p>
              ชำระค่าบริการได้ที่{" "}
              <Link href={`/t/${slug}/settings/billing`} className="font-medium underline underline-offset-4">
                แพ็กเกจและการชำระเงิน
              </Link>
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {platformSuspended ? <ShieldAlert className="size-5 text-destructive" aria-hidden /> : status === "suspended" ? <PlayCircle className="size-5 text-primary" aria-hidden /> : <PauseCircle className="size-5 text-primary" aria-hidden />}
            {platformSuspended ? "เว็บไซต์ถูกระงับโดยทีมงาน" : status === "suspended" ? "เปิดใช้งานเว็บไซต์อีกครั้ง" : "ระงับเว็บไซต์ชั่วคราว"}
          </CardTitle>
          <CardDescription>
            สถานะปัจจุบัน: <StatusBadge status={status} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {platformSuspended
              ? "เว็บไซต์ถูกระงับโดยทีมงาน RentWeb จึงเปิดใช้งานเองไม่ได้ กรุณาติดต่อทีมงานเพื่อดำเนินการต่อ"
              : status === "suspended"
                ? "ลูกค้าจะกลับมาเข้าหน้าร้านได้ตามปกติ ข้อมูลทั้งหมดยังอยู่ครบ"
                : status === "past_due"
                  ? "เว็บไซต์ค้างชำระค่าบริการ ระงับชั่วคราวได้ แต่เมื่อเปิดกลับจะยังเป็นสถานะค้างชำระจนกว่าจะชำระเงิน"
                  : "หน้าร้านจะแสดงข้อความปิดปรับปรุง ข้อมูลและการตั้งค่ายังอยู่ครบ สามารถเปิดกลับได้ทุกเมื่อ"}
          </p>
          {platformSuspended ? null : status === "suspended" ? (
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
          {status === "cancelled" ? null : (
            <ConfirmButton variant="destructive" title={`ยกเลิกเว็บไซต์ ${ctx.tenant.name}?`} description="หน้าร้านจะปิดทันที ข้อมูลจะถูกเก็บไว้ 30 วัน จากนั้นจะถูกลบถาวร" confirmLabel="ยืนยันยกเลิก" action={cancel} disabled={!owner}>
              <XCircle aria-hidden /> ยกเลิกเว็บไซต์
            </ConfirmButton>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
