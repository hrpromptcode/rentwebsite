"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, MailOpen, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { signUp } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { checkName, checkPassword, NAME_MAX, PASSWORD_HINT, PASSWORD_MAX } from "@/lib/signup-rules";

export interface SignupInvite {
  email: string;
  tenantName: string;
}

const PERKS = ["ทดลองใช้ฟรี 14 วัน ไม่ต้องใส่บัตร", "เปิดเว็บได้ภายใน 2 นาทีจากเทมเพลต", "รับเงินผ่าน PromptPay และสลิปโอน"];

export function SignupForm({ next, invite }: { next?: string; invite?: SignupInvite | null }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const nameCheck = checkName(fd.get("name"));
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!nameCheck.ok) return setError(nameCheck.error);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("กรุณากรอกอีเมลให้ถูกต้อง");
    const pwError = checkPassword(password, { email, name: nameCheck.name });
    if (pwError) return setError(pwError);
    setPending(true);
    let res: Awaited<ReturnType<typeof signUp.email>>;
    try {
      res = await signUp.email({ name: nameCheck.name, email, password });
    } catch {
      setPending(false);
      return setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    }
    setPending(false);
    if (res.error) {
      const msg = res.error.message ?? "";
      setError(/exist|already/i.test(msg) ? "อีเมลนี้ถูกใช้แล้ว ลองเข้าสู่ระบบแทน" : msg || "สมัครไม่สำเร็จ");
      return;
    }
    // ADMIN_B2-12: an invitee goes back to the invitation (one click to join), everyone else to the site wizard
    const target = safeNext(next, "/onboarding");
    toast.success(target.startsWith("/invite/") ? "สร้างบัญชีแล้ว กดยืนยันเพื่อเข้าร่วมทีม" : "สร้างบัญชีแล้ว มาสร้างเว็บแรกของคุณกัน");
    router.push(target);
    router.refresh();
  }

  return (
    <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-center">
      <div className="hidden lg:block">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden /> เว็บไซต์สำเร็จรูปสำหรับธุรกิจไทย
        </p>
        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight">
          เปิดเว็บร้านของคุณวันนี้
          <br />
          <span className="gradient-text">ไม่ต้องเขียนโค้ด</span>
        </h1>
        <ul className="mt-6 space-y-3 text-muted-foreground">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700">
                <Check className="size-3" aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <Card className="w-full animate-fade-up">
        <CardHeader>
          <CardTitle className="text-2xl">{invite ? "สมัครบัญชีเพื่อเข้าร่วมทีม" : "สมัครใช้งาน"}</CardTitle>
          <CardDescription>{invite ? `คุณได้รับเชิญเข้าร่วมทีม ${invite.tenantName} — สร้างบัญชีด้วยอีเมลที่ได้รับเชิญ` : "สร้างบัญชีแล้วเลือกเทมเพลตเว็บในขั้นตอนถัดไป"}</CardDescription>
        </CardHeader>
        <CardContent>
          {invite && (
            <p className="mb-5 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
              <MailOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>หลังสมัครเสร็จ ระบบจะพากลับไปที่คำเชิญของ {invite.tenantName} เพื่อยืนยันเข้าร่วมทีม</span>
            </p>
          )}
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="name">ชื่อของคุณ</Label>
              <Input id="name" name="name" autoComplete="name" placeholder="เช่น สมชาย ใจดี" maxLength={NAME_MAX} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">อีเมล</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" defaultValue={invite?.email} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={PASSWORD_MAX} required aria-describedby="password-hint" />
              <p id="password-hint" className="text-xs text-muted-foreground">
                {PASSWORD_HINT}
              </p>
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              สร้างบัญชีฟรี
            </Button>
            <p className="text-center text-xs text-muted-foreground">การสมัครถือว่ายอมรับเงื่อนไขการใช้บริการและนโยบายความเป็นส่วนตัว</p>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            มีบัญชีอยู่แล้ว?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-primary underline-offset-4 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
