import type { Metadata } from "next";
import Link from "next/link";
import { MailOpen, MailX } from "lucide-react";
import { and, eq, getAdminDb, isNull, tenantInvitations, tenants } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { ROLE_LABEL } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "คำเชิญเข้าร่วมทีม" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await requireSession(`/invite/${token}`);
  const [inv] = await getAdminDb()
    .select({ email: tenantInvitations.email, role: tenantInvitations.role, expiresAt: tenantInvitations.expiresAt, tenantName: tenants.name })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(and(eq(tenantInvitations.token, token), isNull(tenantInvitations.acceptedAt)))
    .limit(1);

  const expired = !!inv && inv.expiresAt.getTime() < Date.now();
  const mismatch = !!inv && inv.email.toLowerCase() !== s.user.email.toLowerCase();

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">{inv && !expired ? <MailOpen className="size-6" aria-hidden /> : <MailX className="size-6" aria-hidden />}</span>
          <CardTitle className="mt-2">{!inv ? "คำเชิญไม่ถูกต้อง" : expired ? "คำเชิญหมดอายุแล้ว" : `เข้าร่วมทีม ${inv.tenantName}`}</CardTitle>
          <CardDescription>
            {!inv && "ลิงก์นี้ถูกใช้ไปแล้ว หรือถูกยกเลิกโดยผู้ดูแลร้าน"}
            {inv && expired && "กรุณาขอให้ผู้ดูแลร้านสร้างคำเชิญใหม่"}
            {inv && !expired && `คุณได้รับเชิญในบทบาท “${ROLE_LABEL[inv.role] ?? inv.role}”`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {inv && !expired && mismatch && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              คำเชิญนี้สำหรับ <strong>{inv.email}</strong> แต่คุณเข้าสู่ระบบด้วย {s.user.email}
            </p>
          )}
          {inv && !expired && !mismatch && <AcceptInviteButton token={token} />}
          {mismatch && (
            <Button asChild variant="outline">
              <Link href={`/logout?next=${encodeURIComponent(`/invite/${token}`)}`}>เปลี่ยนบัญชี</Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href="/t">ไปยังหลังบ้านของฉัน</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
