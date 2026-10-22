"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { maskCode } from "./format";
import { Brackets, TopupStyles } from "./topup-styles";

/**
 * Delivered code as a holographic gift card: masked by default, "แสดงโค้ด" flips the code plate (CSS 3D, one element —
 * the text swaps, nothing is duplicated) + copy with a ✓ morph. The code is decrypted server-side only for authorised
 * viewers.
 */
export function CodeReveal({ code, label = "โค้ดของคุณ", hint }: { code: string; label?: string; hint?: string }) {
  const [shown, setShown] = React.useState(false);
  const [flip, setFlip] = React.useState<"in" | "out" | undefined>(undefined);
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
  const toggle = () => {
    setShown((s) => !s);
    setFlip((f) => (f === "in" ? "out" : "in"));
  };

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-primary/40 bg-card/80 p-5 shadow-[0_30px_80px_-40px_var(--glow)] backdrop-blur-xl md:p-7">
      <TopupStyles />
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-48 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-primary" /> {label}
        </div>
        <span aria-hidden className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
          {shown ? "Unlocked" : "Encrypted"}
        </span>
      </div>
      <div className="relative mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative flex-1 [perspective:800px]">
          <code
            data-flip={flip}
            className="tp-code relative flex min-h-14 items-center overflow-hidden rounded-[var(--radius-lg)] border border-primary/50 bg-background/70 px-4 py-3 font-mono text-lg tracking-wider break-all text-foreground [text-shadow:0_0_18px_color-mix(in_oklab,var(--glow)_70%,transparent)] select-all md:text-xl"
            aria-live="polite"
          >
            {shown ? code : maskCode(code)}
          </code>
          <Brackets size={10} className="-m-1.5" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" onClick={toggle} aria-pressed={shown} className="h-14 min-w-28 flex-1 sm:flex-none">
            {shown ? <EyeOff /> : <Eye />} {shown ? "ซ่อน" : "แสดงโค้ด"}
          </Button>
          <Button type="button" size="lg" onClick={copy} className="h-14 min-w-28 flex-1 sm:flex-none">
            {copied ? <Check /> : <Copy />} {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
        </div>
      </div>
      <p className="relative mt-3 text-xs text-muted-foreground">{hint ?? "เก็บโค้ดนี้ไว้เป็นความลับ ใช้ได้ครั้งเดียว ร้านไม่สามารถออกโค้ดใหม่หากถูกใช้ไปแล้ว"}</p>
    </div>
  );
}
