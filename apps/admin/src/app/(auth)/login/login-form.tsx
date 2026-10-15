"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { signIn } from "@/lib/auth-client";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setPending(true);
    const res = await signIn.email({ email, password, rememberMe: true });
    setPending(false);
    if (res.error) {
      setError(res.error.message?.includes("Invalid") ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : (res.error.message ?? "เข้าสู่ระบบไม่สำเร็จ"));
      return;
    }
    toast.success("เข้าสู่ระบบสำเร็จ");
    router.push(next ?? "/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md animate-fade-up">
      <CardHeader>
        <CardTitle className="text-2xl">เข้าสู่ระบบ</CardTitle>
        <CardDescription>จัดการเว็บไซต์ ออเดอร์ และลูกค้าของคุณได้จากที่เดียว</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                {show ? "ซ่อน" : "แสดง"}
              </button>
            </div>
            <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required minLength={8} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
            เข้าสู่ระบบ
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ยังไม่มีบัญชี?{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            สมัครและสร้างเว็บฟรี 14 วัน
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
