"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Phone, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import type { OtpState } from "../actions";

/**
 * Two-step OTP sign-in. Hooks kept for the journeys: #otp-target, #otp-code, #otp-name, each step's submit is the
 * form's only `button[type=submit]`, and the dev-mode line reads "รหัสของคุณคือ 123456".
 */
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
      <form key="code" action={verifyOtp} className="rw-step-in grid gap-5">
        <input type="hidden" name="target" value={state.target} />
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-primary/25 bg-primary-soft p-4 text-sm">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-ink" />
          <div className="min-w-0">
            <p className="font-medium break-words">{labels.otpSent.replace("{target}", state.target)}</p>
            {state.devCode && (
              <p className="mt-1 text-xs text-muted-foreground">
                (โหมดพัฒนา) รหัสของคุณคือ <span className="font-mono text-base font-semibold tracking-[0.12em] text-foreground">{state.devCode}</span>
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="otp-code">{labels.enterOtp}</Label>
          <Input
            id="otp-code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            className="rw-otp-code h-16 rounded-[var(--radius-lg)] text-center font-mono text-3xl tracking-[0.55em] [text-indent:0.55em]"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="otp-name">
            {labels.name} <span className="font-normal text-muted-foreground">(ถ้าเป็นครั้งแรก)</span>
          </Label>
          <Input id="otp-name" name="name" autoComplete="name" className="h-12" />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={verifying} className="group h-13 w-full text-base">
          {verifying ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {labels.verify}
        </Button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden className="size-3.5" />
          เปลี่ยนเบอร์ / ขอรหัสใหม่
        </button>
      </form>
    );
  }

  return (
    <form key="target" action={requestOtp} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="otp-target">{labels.phone}</Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="otp-target" name="target" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="08x-xxx-xxxx หรืออีเมล" required className="h-13 pl-11 text-base" autoFocus />
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={requesting} className="group h-13 w-full text-base">
        {requesting ? <Loader2 className="size-4 animate-spin" /> : null}
        {labels.sendOtp}
        {!requesting && <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />}
      </Button>
    </form>
  );
}
