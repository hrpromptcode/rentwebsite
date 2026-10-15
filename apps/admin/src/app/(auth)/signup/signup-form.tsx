"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { signUp } from "@/lib/auth-client";

const PERKS = ["ทดลองใช้ฟรี 14 วัน ไม่ต้องใส่บัตร", "เปิดเว็บได้ภายใน 2 นาทีจากเทมเพลต", "รับเงินผ่าน PromptPay และสลิปโอน"];

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (name.length < 2) return setError("กรุณากรอกชื่อของคุณ");
    if (password.length < 8) return setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    setPending(true);
    const res = await signUp.email({ name, email, password });
    setPending(false);
    if (res.error) {
      const msg = res.error.message ?? "";
      setError(/exist|already/i.test(msg) ? "อีเมลนี้ถูกใช้แล้ว ลองเข้าสู่ระบบแทน" : msg || "สมัครไม่สำเร็จ");
      return;
    }
    toast.success("สร้างบัญชีแล้ว มาสร้างเว็บแรกของคุณกัน");
    router.push("/onboarding");
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
          <CardTitle className="text-2xl">สมัครใช้งาน</CardTitle>
          <CardDescription>สร้างบัญชีแล้วเลือกเทมเพลตเว็บในขั้นตอนถัดไป</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="name">ชื่อของคุณ</Label>
              <Input id="name" name="name" autoComplete="name" placeholder="เช่น สมชาย ใจดี" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">อีเมล</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <p className="text-xs text-muted-foreground">อย่างน้อย 8 ตัวอักษร</p>
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
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
