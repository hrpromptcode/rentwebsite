"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Loader2, MailOpen, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
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

/** Shown under the heading (all widths); the big marketing line lives in the shop-windows panel (lg). */
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
    <div className="w-full max-w-[28rem]">
      <p className="rw-enter rw-mono text-primary" data-script="thai">
        (01) — เว็บไซต์สำเร็จรูปสำหรับธุรกิจไทย
      </p>
      <h1 className="rw-enter mt-5 font-heading text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.15] font-semibold text-balance" style={{ ["--d" as string]: "60ms" }}>
        {invite ? "สมัครบัญชีเพื่อเข้าร่วมทีม" : "สมัครใช้งาน"}
      </h1>
      <p className="rw-enter mt-3 text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground" style={{ ["--d" as string]: "120ms" }}>
        {invite ? `คุณได้รับเชิญเข้าร่วมทีม ${invite.tenantName} — สร้างบัญชีด้วยอีเมลที่ได้รับเชิญ` : "สร้างบัญชีแล้วเลือกเทมเพลตเว็บในขั้นตอนถัดไป"}
      </p>
      {!invite && (
        <ul className="rw-enter mt-6 grid gap-2.5 text-sm text-foreground/85" style={{ ["--d" as string]: "160ms" }}>
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Check className="size-3" aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>
      )}
      {invite && (
        <p className="rw-enter mt-6 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary-soft px-4 py-3 text-sm text-foreground">
          <MailOpen className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>หลังสมัครเสร็จ ระบบจะพากลับไปที่คำเชิญของ {invite.tenantName} เพื่อยืนยันเข้าร่วมทีม</span>
        </p>
      )}

      <form onSubmit={onSubmit} className="rw-enter mt-9 grid gap-5" style={{ ["--d" as string]: "200ms" }} noValidate>
        <div className="grid gap-2.5">
          <Label htmlFor="name" className="text-sm font-medium">
            ชื่อของคุณ
          </Label>
          <Input id="name" name="name" autoComplete="name" placeholder="เช่น สมชาย ใจดี" maxLength={NAME_MAX} required className="rw-field" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="email" className="text-sm font-medium">
            อีเมล
          </Label>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" defaultValue={invite?.email} required className="rw-field" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="password" className="text-sm font-medium">
            รหัสผ่าน
          </Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={PASSWORD_MAX} required aria-describedby="password-hint" className="rw-field" />
          <p id="password-hint" className="text-xs leading-relaxed text-muted-foreground">
            {PASSWORD_HINT}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="rw-cta mt-1 w-full">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          สร้างบัญชีฟรี
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">การสมัครถือว่ายอมรับเงื่อนไขการใช้บริการและนโยบายความเป็นส่วนตัว</p>
      </form>

      <div className="rw-enter mt-8 flex items-center justify-between gap-4 border-t border-border pt-6 text-sm" style={{ ["--d" as string]: "260ms" }}>
        <span className="text-muted-foreground">มีบัญชีอยู่แล้ว?</span>
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="group inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
          เข้าสู่ระบบ
          <ArrowUpRight aria-hidden className="size-4 text-primary transition-transform duration-300 group-hover:rotate-45" />
        </Link>
      </div>
    </div>
  );
}
