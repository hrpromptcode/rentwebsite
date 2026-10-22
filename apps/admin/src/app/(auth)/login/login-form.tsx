"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { signIn } from "@/lib/auth-client";

/**
 * Admin sign-in. Journey hooks: #email, #password, exactly ONE button whose name contains "เข้าสู่ระบบ" (the
 * show/hide toggle says "แสดง"/"ซ่อน"), errors in `form p[role=alert]`.
 */
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
    router.push(safeNext(next));
    router.refresh();
  }

  const invite = next?.startsWith("/invite/");

  return (
    <div className="w-full max-w-[27rem]">
      <p className="rw-enter rw-mono text-primary" data-script="latin">
        (01) — Sign in
      </p>
      <h1 className="rw-enter mt-5 font-heading text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.15] font-semibold" style={{ ["--d" as string]: "60ms" }}>
        เข้าสู่ระบบ
      </h1>
      <p className="rw-enter mt-3 text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground" style={{ ["--d" as string]: "120ms" }}>
        จัดการเว็บไซต์ ออเดอร์ และลูกค้าของคุณได้จากที่เดียว
      </p>

      <form onSubmit={onSubmit} className="rw-enter mt-10 grid gap-6" style={{ ["--d" as string]: "180ms" }} noValidate>
        <div className="grid gap-2.5">
          <Label htmlFor="email" className="text-sm font-medium">
            อีเมล
          </Label>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required className="rw-field" />
        </div>
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              รหัสผ่าน
            </Label>
            <button type="button" onClick={() => setShow((s) => !s)} className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              {show ? "ซ่อน" : "แสดง"}
            </button>
          </div>
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required minLength={8} className="rw-field" />
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="rw-cta mt-1 w-full">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          เข้าสู่ระบบ
          {!pending && <ArrowRight aria-hidden />}
        </Button>
      </form>

      <div className="rw-enter mt-10 flex items-center justify-between gap-4 border-t border-border pt-6 text-sm" style={{ ["--d" as string]: "240ms" }}>
        <span className="text-muted-foreground">ยังไม่มีบัญชี?</span>
        {/* ADMIN_B2-12: keep ?next (e.g. /invite/<token>) through sign-up */}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="group inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
          {invite ? "สมัครบัญชีเพื่อเข้าร่วมทีม" : "สมัครและสร้างเว็บฟรี 14 วัน"}
          <ArrowUpRight aria-hidden className="size-4 text-primary transition-transform duration-300 group-hover:rotate-45" />
        </Link>
      </div>
    </div>
  );
}
