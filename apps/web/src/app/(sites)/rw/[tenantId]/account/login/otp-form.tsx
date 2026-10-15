"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, Loader2, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import type { OtpState } from "../actions";

export function OtpForm({
  requestAction,
  verifyAction,
  labels,
}: {
  requestAction: (prev: OtpState, form: FormData) => Promise<OtpState>;
  verifyAction: (prev: OtpState, form: FormData) => Promise<OtpState>;
  labels: { title: string; phone: string; sendOtp: string; enterOtp: string; verify: string; otpSent: string; name: string };
}) {
  const [reqState, requestOtp, requesting] = useActionState(requestAction, { step: "target" } as OtpState);
  const [verState, verifyOtp, verifying] = useActionState(verifyAction, { step: "code" } as OtpState);
  const state: OtpState = verState.error || verState.step === "target" ? { ...reqState, ...verState, step: verState.step } : reqState;

  if (state.step === "code" && state.target) {
    return (
      <form action={verifyOtp} className="grid gap-5">
        <input type="hidden" name="target" value={state.target} />
        <div className="rounded-[var(--radius-lg)] bg-primary-soft p-4 text-sm">
          <p className="font-medium">{labels.otpSent.replace("{target}", state.target)}</p>
          {state.devCode && (
            <p className="mt-1 text-xs text-muted-foreground">
              (โหมดพัฒนา) รหัสของคุณคือ <span className="font-mono text-base font-semibold text-foreground">{state.devCode}</span>
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="otp-code">{labels.enterOtp}</Label>
          <Input id="otp-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus required className="h-14 text-center font-mono text-2xl tracking-[0.5em]" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="otp-name">{labels.name} <span className="text-muted-foreground">(ถ้าเป็นครั้งแรก)</span></Label>
          <Input id="otp-name" name="name" autoComplete="name" />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" size="lg" disabled={verifying}>
          {verifying ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {labels.verify}
        </Button>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => window.location.reload()}>
          เปลี่ยนเบอร์ / ขอรหัสใหม่
        </button>
      </form>
    );
  }

  return (
    <form action={requestOtp} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="otp-target">{labels.phone}</Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="otp-target" name="target" type="tel" inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx หรืออีเมล" required className="h-12 pl-10" autoFocus />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" disabled={requesting}>
        {requesting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {labels.sendOtp}
      </Button>
    </form>
  );
}
