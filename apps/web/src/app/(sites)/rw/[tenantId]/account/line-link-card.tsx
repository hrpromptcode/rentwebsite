"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Link2, Loader2, Unlink2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { LineLoginButton, LineMark } from "./line-button";

export type UnlinkState = { error?: string };

/**
 * Account page card: shows whether this customer is connected to LINE and lets them connect (link flow through
 * /api/auth/line/start) or disconnect (server action with an inline two-step confirmation – no window.confirm).
 */
export function LineLinkCard({
  linked,
  enabled,
  avatar,
  displayName,
  canUnlink,
  unlinkAction,
}: {
  linked: boolean;
  /** tenant allows LINE login (a linked customer still sees the card when it is off, so they can disconnect) */
  enabled: boolean;
  avatar: string | null;
  displayName: string | null;
  /** false when LINE is the only way back in (no phone / e-mail) */
  canUnlink: boolean;
  unlinkAction: (prev: UnlinkState, form: FormData) => Promise<UnlinkState>;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [state, action, pending] = useActionState(unlinkAction, {} as UnlinkState);

  return (
    <section aria-labelledby="line-link-title" data-testid="line-link-card" data-linked={linked ? "true" : "false"} className="card mt-8 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-white" aria-hidden="true">
          <LineMark className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="line-link-title" className="font-heading text-lg font-semibold">
            บัญชี LINE
          </h2>
          {linked ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1 text-[#047a37] dark:text-[#4ade80]">
                <CheckCircle2 className="size-4" aria-hidden="true" /> เชื่อมต่อ LINE แล้ว
              </span>
              {displayName && (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  {avatar && <img src={avatar} alt="" width={24} height={24} className="size-6 rounded-full object-cover" />}
                  {displayName}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">เชื่อมต่อบัญชี LINE เพื่อเข้าสู่ระบบครั้งถัดไปได้ในคลิกเดียว ไม่ต้องรอรหัส OTP</p>
          )}

          {linked ? (
            <div className="mt-4">
              {!confirming ? (
                <Button type="button" variant="outline" className="h-11 md:h-10" onClick={() => setConfirming(true)} disabled={!canUnlink} data-testid="line-unlink">
                  <Unlink2 className="size-4" aria-hidden="true" /> ยกเลิกการเชื่อมต่อ
                </Button>
              ) : (
                <form action={action} className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-muted/40 p-4" aria-live="polite">
                  <p className="text-sm">ยืนยันยกเลิกการเชื่อมต่อ LINE? ครั้งถัดไปคุณจะต้องเข้าสู่ระบบด้วยรหัส OTP ทางเบอร์โทรศัพท์หรืออีเมล</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="destructive" className="h-11 md:h-10" disabled={pending} data-testid="line-unlink-confirm">
                      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Unlink2 className="size-4" aria-hidden="true" />}
                      ยืนยันยกเลิก
                    </Button>
                    <Button type="button" variant="ghost" className="h-11 md:h-10" onClick={() => setConfirming(false)} disabled={pending}>
                      ไม่ใช่ตอนนี้
                    </Button>
                  </div>
                </form>
              )}
              {!canUnlink && <p className="mt-2 text-xs text-muted-foreground">บัญชีนี้ยังไม่มีเบอร์โทรศัพท์หรืออีเมล จึงยกเลิกการเชื่อมต่อ LINE ไม่ได้ (ไม่เช่นนั้นจะเข้าสู่ระบบไม่ได้อีก)</p>}
              {state.error && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}
            </div>
          ) : enabled ? (
            <div className="mt-4 max-w-xs">
              <LineLoginButton link next="/account">
                <Link2 className="size-5" aria-hidden="true" /> เชื่อมต่อ LINE
              </LineLoginButton>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">ร้านนี้ยังไม่เปิดให้เชื่อมต่อ LINE</p>
          )}
        </div>
      </div>
    </section>
  );
}
