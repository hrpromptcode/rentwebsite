"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { maskCode } from "./format";

/** Shows a delivered code masked by default with reveal + copy. The code is decrypted server-side only for authorised viewers. */
export function CodeReveal({ code, label = "โค้ดของคุณ", hint }: { code: string; label?: string; hint?: string }) {
  const [shown, setShown] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked – user can select manually */
    }
  };

  return (
    <div className="card relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/30 blur-3xl" aria-hidden />
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-primary" /> {label}
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 rounded-[var(--radius-lg)] border border-primary/40 bg-background/60 px-4 py-3 font-mono text-lg tracking-wider text-glow select-all md:text-xl" aria-live="polite">
          {shown ? code : maskCode(code)}
        </code>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setShown((s) => !s)} aria-pressed={shown} className="min-w-28">
            {shown ? <EyeOff /> : <Eye />} {shown ? "ซ่อน" : "แสดงโค้ด"}
          </Button>
          <Button type="button" onClick={copy} className="min-w-28">
            {copied ? <Check /> : <Copy />} {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{hint ?? "เก็บโค้ดนี้ไว้เป็นความลับ ใช้ได้ครั้งเดียว ร้านไม่สามารถออกโค้ดใหม่หากถูกใช้ไปแล้ว"}</p>
    </div>
  );
}
